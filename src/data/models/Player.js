// src/data/models/Player.js
import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  discordId:        { type: String, required: true, unique: true },
  wallet:           { type: String, default: null },
  faction:          { type: String, default: null },
  level:            { type: Number, default: 1 },
  xp:               { type: Number, default: 0 },
  coins:            { type: Number, default: 0 },
  hp:               { type: Number, default: 100 },
  hpMax:            { type: Number, default: 100 },
  attributes: {
    vitalite:       { type: Number, default: 5 },
    sagesse:        { type: Number, default: 5 },
    force:          { type: Number, default: 5 },
    intelligence:   { type: Number, default: 5 },
    chance:         { type: Number, default: 5 },
    agilite:        { type: Number, default: 5 }
  },
  unassignedPoints: { type: Number, default: 0 },
  missionsCompleted:{ type: Number, default: 0 },
  lastMissionAt:    { type: Date, default: null },
  duelsWon:         { type: Number, default: 0 },
  duelsLost:        { type: Number, default: 0 },
  healing:          { type: Boolean, default: false },
  healStartAt:      { type: Date, default: null },
  inExpedition:     { type: Boolean, default: false },
  raidParticipation:{
    raidId:         { type: String, default: null },
    damageDealt:    { type: Number, default: 0 }
  }
}, { timestamps: true });

export default mongoose.model('Player', playerSchema);
