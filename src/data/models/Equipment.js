import mongoose from 'mongoose';

const equipmentSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  category:    { type: String, required: true, enum: ['weapon','helmet','chest','pants','shoes','gloves'] },
  rarity:      { type: String, required: true, enum: ['common','uncommon','rare','epic','legendary'] },
  stats: { // additive bonuses
    vitalite:     { type: Number, default: 0 },
    sagesse:      { type: Number, default: 0 },
    force:        { type: Number, default: 0 },
    intelligence: { type: Number, default: 0 },
    chance:       { type: Number, default: 0 },
    agilite:      { type: Number, default: 0 }
  }
});

export default mongoose.model('Equipment', equipmentSchema);
