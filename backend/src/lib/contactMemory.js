import ContactMemory from "../models/contactMemory.model.js";

const MAX_FACTS = 10;
const MAX_FACT_LENGTH = 200;

export const getContactFacts = async (ownerId, contactId) => {
  const memory = await ContactMemory.findOne({ ownerId, contactId }).lean();
  return memory?.facts.map((f) => f.text) || [];
};

export const rememberFact = async (ownerId, contactId, text) => {
  const fact = text?.trim().slice(0, MAX_FACT_LENGTH);
  if (!fact) return;

  const memory = await ContactMemory.findOneAndUpdate(
    { ownerId, contactId },
    { $setOnInsert: { ownerId, contactId } },
    { upsert: true, new: true }
  );
  if (memory.facts.some((f) => f.text.toLowerCase() === fact.toLowerCase())) return;

  memory.facts.push({ text: fact });
  memory.facts = memory.facts.slice(-MAX_FACTS);
  await memory.save();
};
