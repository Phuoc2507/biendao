import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Stage } from "./components/Stage";
import { Mannequin } from "./components/Mannequin";
import { PlaybackClock } from "./components/PlaybackClock";
import { Timeline } from "./components/Timeline";
import { Panel } from "./components/Panel";
import { useStore } from "./store";
import { loadClip } from "./clip";

export default function App() {
  const clip = useStore((s) => s.clip);
  const dancers = useStore((s) => s.dancers);
  const setClip = useStore((s) => s.setClip);
  const setPlaying = useStore((s) => s.setPlaying);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClip("/clips/demo.json")
      .then((c) => {
        setClip(c);
        setPlaying(true);
      })
      .catch((e) => setError(String(e)));
  }, [setClip, setPlaying]);

  return (
    <div className="app">
      <Panel />

      <div className="viewport">
        <Canvas shadows camera={{ position: [3.5, 2.4, 5], fov: 45 }}>
          <color attach="background" args={["#12161c"]} />
          <Stage />
          <PlaybackClock />
          {clip &&
            dancers.map((d) => <Mannequin key={d.id} clip={clip} dancer={d} />)}
          <OrbitControls
            target={[0, 1, 0]}
            enableDamping
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
        </Canvas>

        {error && <div className="error">Lỗi nạp clip: {error}</div>}
        {!clip && !error && <div className="loading">Đang nạp clip…</div>}
      </div>

      <Timeline />
    </div>
  );
}
