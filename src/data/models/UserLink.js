// src/services/models/UserLink.js
import mongoose from 'mongoose';

const UserLinkSchema = new mongoose.Schema(
  {
    discordId:          { type: String, required: true, unique: true },
    wallet:             { type: String, required: true, unique: true },
    registrationNumber: { type: Number, required: true, unique: true },
    verified:           { type: Boolean, default: false },
    verifiedAt:         { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('UserLink', UserLinkSchema);
