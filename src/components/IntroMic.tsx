import { Mic } from "lucide-react";

export function IntroMic() {
  return (
    <div className="intro-mic">
      <div className="intro-mic-ring" />
      <Mic />
      <span className="intro-spark spark-one" />
      <span className="intro-spark spark-two" />
    </div>
  );
}
