// src/data/models/Faction.js
import mongoose from 'mongoose';

const factionSchema = new mongoose.Schema({
  name:            { type: String, required: true, unique: true },
  membersCount:    { type: Number, default: 0 },
  warScore:        { type: Number, default: 0 },
  warVictories:    { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Faction', factionSchema);
