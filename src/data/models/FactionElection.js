import mongoose from 'mongoose';

const VoteSchema = new mongoose.Schema({
  voterId:   { type: String, required: true },     // discordId of voter
  candidateId:{ type: String, required: true },    // discordId of candidate
  at:        { type: Date,   default: Date.now }
}, { _id:false });

const FactionElectionSchema = new mongoose.Schema({
  faction:    { type: String, enum:['Red','Blue','Green'], index:true, required:true },
  messageId:  { type: String },     // ballot message to edit/disable
  channelId:  { type: String },     // where the ballot lives
  startedAt:  { type: Date,   default: Date.now },
  endsAt:     { type: Date,   required:true },
  votes:      { type: [VoteSchema], default: [] },
  isClosed:   { type: Boolean, default:false },
  winnerId:   { type: String },     // discordId of elected manager
}, { timestamps:true });

export default mongoose.model('FactionElection', FactionElectionSchema);
