import { config } from "dotenv";
import Groq from "groq-sdk";

config({ path: ".env" });
config({ path: ".env.local" });
config({ path: ".env.recorder" });

async function main() {
  const key = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY ? "SET" : "MISSING";
  console.log("GROQ_API_KEY:", key ? "SET" : "MISSING", "| GEMINI_API_KEY:", geminiKey);
  if (!key) return;

  const groq = new Groq({ apiKey: key });
  const models = await groq.models.list();
  const ids = models.data.map((m) => m.id).sort();
  console.log("AVAILABLE MODELS:", JSON.stringify(ids));

  const candidates = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
  ];
  for (const id of candidates) {
    const listed = ids.includes(id);
    if (!listed) {
      console.log(`MODEL ${id}: listed=false`);
      continue;
    }
    try {
      const c = await groq.chat.completions.create({
        model: id,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 200,
      });
      const content = c.choices?.[0]?.message?.content;
      console.log(`MODEL ${id}: works=${!!content} reply=${JSON.stringify(content?.slice(0, 60))} finish=${c.choices?.[0]?.finish_reason}`);
    } catch (e: any) {
      console.log(`MODEL ${id}: ERROR ${e.message}`);
    }
  }
  console.log("whisper-large-v3-turbo listed:", ids.includes("whisper-large-v3-turbo"));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
