// src/data/models/Faction.js
import mongoose from 'mongoose';

const factionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    default: ""
  },
  color: {
    type: String,
    default: "#ffffff"
  },
  membersCount: {
    type: Number,
    default: 0
  },
  warOngoing: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export default mongoose.model('Faction', factionSchema);
