export interface PackBotOverlay {
  botTitle: string;
  overlayPrompt: string;
}

export interface PackScenario {
  title: string;
  category: string;
  difficulty: "Tactical" | "Strategic" | "Critical";
  situation: string;
  actions: string[];
  missionObjective: string;
  recommendedBots: string[];
}

export interface PackPipelineStep {
  botTitle: string;
  instruction: string;
}

export interface PackPipeline {
  name: string;
  triggerType: "manual" | "webhook" | "pipeline_completion";
  steps: PackPipelineStep[];
}

export interface PackKBDocument {
  title: string;
  filename: string;
  content: string;
}

export interface VerticalPack {
  id: string;
  name: string;
  industry: string;
  icon: string;
  color: string;
  tagline: string;
  description: string;
  highlights: string[];
  botOverlays: PackBotOverlay[];
  scenarios: PackScenario[];
  pipelines: PackPipeline[];
  kbDocuments: PackKBDocument[];
}
