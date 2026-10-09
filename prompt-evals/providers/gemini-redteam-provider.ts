/**
 * Custom Gemini provider for the red-teaming suite's `redteam.provider`
 * (attack generation + grading). Not the built-in `google:gemini-...`
 * provider spec — that spec consistently returned 0 usable test cases for
 * the `overreliance` plugin specifically (confirmed via a raw-fetch
 * diagnostic using the identical model, prompt, and JSON-mode config, which
 * succeeded where the built-in provider failed) — so this calls Gemini's
 * REST API directly instead.
 */
export default class GeminiRedteamProvider {
  id() {
    return "gemini-redteam-provider";
  }

  async callApi(prompt: string): Promise<{ output: string; error?: string }> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { output: "", error: "GOOGLE_API_KEY is not set." };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      return { output: "", error: `Gemini API error ${res.status}: ${await res.text()}` };
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { output: text };
  }
}
