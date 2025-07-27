import mongoose from 'mongoose';

const equipmentSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  category:    { type: String, required: true, enum: ['weapon','helmet','chest','pants','shoes','gloves'] },
  rarity:      { type: String, required: true, enum: ['common','uncommon','rare','epic','legendary'] },
  stats: { // additive bonuses
    vitality:     { type: Number, default: 0 },
    wisdom:      { type: Number, default: 0 },
    strength:        { type: Number, default: 0 },
    intelligence: { type: Number, default: 0 },
    luck:       { type: Number, default: 0 },
    agility:      { type: Number, default: 0 }
  }
});

export default mongoose.model('Equipment', equipmentSchema);
