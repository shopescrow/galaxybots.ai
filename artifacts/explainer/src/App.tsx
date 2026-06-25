import { HashRouter, Routes, Route } from "react-router-dom";
import VideoWithControls from "@/components/video/VideoWithControls";
import DefinitionPage from "@/components/DefinitionPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<VideoWithControls />} />
        <Route path="/define/:slug" element={<DefinitionPage />} />
        <Route path="*" element={<VideoWithControls />} />
      </Routes>
    </HashRouter>
  );
}
