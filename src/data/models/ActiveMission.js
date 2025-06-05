// src/data/models/ActiveMission.js
import mongoose from 'mongoose';

const ActiveMissionSchema = new mongoose.Schema(
  {
    discordId:   { type: String, required: true },
    missionType: { type: String, required: true },
    startAt:     { type: Date,   required: true },
    endAt:       { type: Date,   required: true },
    xpReward:    { type: Number, required: true },
    coinReward:  { type: Number, required: true },
    hpCost:      { type: Number, required: true },   // store the final reduced HP cost
    claimed:     { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('ActiveMission', ActiveMissionSchema);
