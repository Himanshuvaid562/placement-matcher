const mongoose = require("mongoose");

// PDF bytes, kept apart from Credential so listing credentials never loads files.
const credentialFileSchema = new mongoose.Schema(
  {
    credentialId: { type: mongoose.Schema.Types.ObjectId, ref: "Credential", required: true, unique: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CredentialFile", credentialFileSchema);
