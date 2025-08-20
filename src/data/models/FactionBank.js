// src/data/models/FactionBank.js
import mongoose from 'mongoose';

const FactionBankSchema = new mongoose.Schema({
  faction:  { type: String, enum: ['Red','Blue','Green'], unique: true },
  treasury: { type: Number, default: 0 },
  lastInterestAt: { type: Date, default: Date.now },

  // ⬇️ Suivi des dons « aujourd’hui »
  dailyDonationGross:           { type: Number, default: 0 }, // total donné par la faction (brut)
  dailyDonationPlatformCut:     { type: Number, default: 0 }, // 75% plateforme (journalier)
  dailyDonationRedistributable: { type: Number, default: 0 }, // 25% à redistribuer (journalier)
  lastDonationResetAt:          { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('FactionBank', FactionBankSchema);
