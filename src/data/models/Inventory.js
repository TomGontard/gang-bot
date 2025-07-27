// src/data/models/Inventory.js
import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  items:     { type: [String], default: [] }, // array of item.id
  equipped: {
    weapon:   { type: String, default: null },
    helmet:   { type: String, default: null },
    chest:    { type: String, default: null },
    pants:    { type: String, default: null },
    shoes:    { type: String, default: null },
    gloves:   { type: String, default: null }
  }
});

export default mongoose.model('Inventory', inventorySchema);
