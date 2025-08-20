// src/data/models/Territory.js
import mongoose from 'mongoose';

const DefenderSchema = new mongoose.Schema({
  discordId: { type: String, required: true },
  sinceAt:   { type: Date,   default: Date.now }
}, { _id: false });

const AttackSchema = new mongoose.Schema({
  attackerFaction: { type: String, enum: ['Red','Blue','Green'] },
  startedAt:       { type: Date },
  endAt:           { type: Date },
  attackers:       { type: [String], default: [] },  // discordIds
  locked:          { type: Boolean, default: true }
}, { _id: false });

const TerritorySchema = new mongoose.Schema({
  key:         { type: String, unique: true, index: true }, // "r0c0"
  owner:       { type: String, enum: ['Red','Blue','Green','Neutral'], required: true, default: 'Neutral' },
  building:    {
    type:  { type: String, enum: ['cash','casino','armory', null], default: null },
    level: { type: Number, default: 0 }
  },
  fortLevel:   { type: Number, default: 0 },
  defenders:   { type: [DefenderSchema], default: [] },
  truceUntil:  { type: Date, default: null },
  lastIncomeAt:{ type: Date, default: Date.now },
  attack:      { type: AttackSchema, default: null }
}, { timestamps: true });

export default mongoose.model('Territory', TerritorySchema);

