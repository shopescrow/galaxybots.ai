const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

interface ElevenLabsConversation {
  conversation_id: string;
  transcript?: string;
  metadata?: Record<string, unknown>;
  analysis?: { summary?: string };
}

export async function fetchElevenLabsTranscript(
  agentId: string,
  callSid: string
): Promise<{ transcript: string | null; summary: string | null }> {
  const listRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}`,
    { headers: { "xi-api-key": ELEVENLABS_API_KEY! } }
  );
  if (!listRes.ok) {
    console.warn("[AI Receptionist] ElevenLabs conversation list failed:", listRes.status);
    return { transcript: null, summary: null };
  }

  const listData = await listRes.json() as { conversations?: ElevenLabsConversation[] };
  const conversations = listData.conversations || [];

  const match = conversations.find(
    (c: ElevenLabsConversation) =>
      c.metadata && (c.metadata as Record<string, unknown>).twilio_call_sid === callSid
  );

  if (!match) {
    console.warn(`[AI Receptionist] No ElevenLabs conversation found for CallSid ${callSid}`);
    return { transcript: null, summary: null };
  }

  const detailRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${match.conversation_id}`,
    { headers: { "xi-api-key": ELEVENLABS_API_KEY! } }
  );
  if (!detailRes.ok) {
    return { transcript: null, summary: null };
  }

  const detail = await detailRes.json() as ElevenLabsConversation;
  return {
    transcript: detail.transcript || null,
    summary: detail.analysis?.summary || null,
  };
}

export async function testElevenLabsAgent(agentId: string): Promise<{ success: boolean; agentName?: string; error?: string }> {
  const apiKey = ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ELEVENLABS_API_KEY not configured" };
  }
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (response.ok) {
      const data = await response.json() as { name?: string };
      return { success: true, agentName: data.name || "Agent found" };
    }
    return { success: false, error: `ElevenLabs API error: ${response.status}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function initiateOutboundCall(agentId: string, phoneNumber: string, contextNotes?: string): Promise<{ success: boolean; callSid?: string; error?: string; statusCode?: number }> {
  const apiKey = ELEVENLABS_API_KEY;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!apiKey) {
    return { success: false, error: "ELEVENLABS_API_KEY not configured" };
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: twilioPhoneNumber,
      to_number: phoneNumber,
      ...(contextNotes ? { custom_llm_extra_body: { context: contextNotes } } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `ElevenLabs API error: ${errText}`, statusCode: response.status };
  }

  const data = await response.json() as { call_sid?: string };
  return { success: true, callSid: data.call_sid };
}
