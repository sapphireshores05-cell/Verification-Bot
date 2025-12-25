require('dotenv').config(); // Load environment variables
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

const TOKEN = process.env.BOT_TOKEN;
const UNVERIFIED_ROLE_NAME = "UNVERIFIED";
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MAX_TIME = 72 * 60 * 60 * 1000; // 72 hours
const DATA_FILE = path.join(__dirname, "unverified.json");

// Load persisted timestamps
let unverifiedTimestamps = new Map();
if (fs.existsSync(DATA_FILE)) {
  try {
    const rawData = fs.readFileSync(DATA_FILE);
    const parsed = JSON.parse(rawData);
    unverifiedTimestamps = new Map(Object.entries(parsed));
  } catch (err) {
    console.error("Failed to load unverified timestamps:", err);
  }
}

// Save timestamps to file
function saveTimestamps() {
  const obj = Object.fromEntries(unverifiedTimestamps);
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

// Ready event
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  setInterval(async () => {
    try {
      await checkUnverifiedMembers();
    } catch (err) {
      console.error("Error in checkUnverifiedMembers:", err);
    }
  }, CHECK_INTERVAL);
});

// Auto-assign UNVERIFIED role on join
client.on("guildMemberAdd", async member => {
  const role = member.guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
  if (role) {
    await member.roles.add(role).catch(console.error);
    unverifiedTimestamps.set(member.id, Date.now());
    saveTimestamps();
  }
});

// Track role changes
client.on("guildMemberUpdate", (oldMember, newMember) => {
  const role = newMember.guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
  if (!role) return;

  // Role added
  if (!oldMember.roles.cache.has(role.id) && newMember.roles.cache.has(role.id)) {
    unverifiedTimestamps.set(newMember.id, Date.now());
    saveTimestamps();
  }

  // Role removed
  if (oldMember.roles.cache.has(role.id) && !newMember.roles.cache.has(role.id)) {
    unverifiedTimestamps.delete(newMember.id);
    saveTimestamps();
  }
});

// Kick unverified members
async function checkUnverifiedMembers() {
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch();
    const role = guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE_NAME);
    if (!role) continue;

    for (const member of role.members.values()) {
      if (member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;

      const assignedAt = unverifiedTimestamps.get(member.id);
      if (!assignedAt) continue;

      if (Date.now() - assignedAt >= MAX_TIME) {
        console.log(`Kicking ${member.user.tag} for not verifying in 72 hours.`);
        await member.kick("Failed verification after 72 hours").catch(console.error);
        unverifiedTimestamps.delete(member.id);
        saveTimestamps();
      }
    }
  }
}

// Catch client errors
client.on("error", console.error);
client.on("shardError", console.error);

// Login
client.login(TOKEN);
