const crypto = require("crypto");

// No look-alike characters (0/O, 1/l/I) because an officer reads this out to a student in person.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTemporaryPassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

module.exports = { generateTemporaryPassword, ALPHABET };
