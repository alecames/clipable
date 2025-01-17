"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpring, animated } from "react-spring";

enum State {
  Idle,
  ErrorUpload,
  ErrorEncoding,
  Success,
  Uploading,
  Queued,
  Encoding,
}

export default function Home() {
  const router = useRouter();

  const [state, setState] = useState<State>(State.Idle);
  const [title, setTitle] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [file, setFile] = useState<File>();
  const [clipId, setClipId] = useState<string>("");
  const [unlisted, setUnlisted] = useState<boolean>(false);
  const [oldVal, setOldVal] = useState<number>(0);
  const barvalue = useSpring({
    config: { duration: 1000 },
    percent: progress,
  });

  const uploadVideo = async () => {
    if (!file || !title) return;

    setState(State.Uploading);

    const multiPartForm = new FormData();

    multiPartForm.append("json", JSON.stringify({ title, description, unlisted }));
    multiPartForm.append("video", file);

    const req = new XMLHttpRequest();
    req.open("POST", "/api/clips", true);
    req.withCredentials = true;

    req.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.ceil((e.loaded / e.total) * 100));
      }
    };

    req.onload = () => {
      if (req.readyState === 4) {
        if (req.status === 200) {
          setState(State.Queued);
          setClipId(JSON.parse(req.responseText).id);
        } else {
          setState(State.ErrorUpload);
        }
      }
    };

    req.send(multiPartForm);
  };

  // A UseEffect hook that loops every 1 second to check progress
  useEffect(() => {
    if (state == State.Queued) {
      const checkProgress = async () => {
        const resp = await fetch(`/api/clips/progress?cid=${clipId}`);

        if (resp.status === 200) {
          const json = await resp.json();
          let progress = json.clips[clipId];

          // If progress is 0, set it to 1 so the progress bar at least shows something
          progress = progress === 0 ? 1 : progress;

          // If progress is greater than 0, update the progress bar
          if (progress > 0) {
            setProgress(progress);
          }

          // If we were previously queued, but now we have a non-negative progress, we are now encoding
          if (state == State.Queued && progress >= 0) {
            setState(State.Encoding);
          }

          // If the process is -2 the clip failed to encode
          if (progress === -2) {
            setState(State.ErrorEncoding);
            clearInterval(interval);
          }
        } else if (resp.status == 204) {
          setState(State.Success);
          // redirect to clip
          router.push(`/clips/${clipId}`);
        }
      };
      const interval = setInterval(checkProgress, 1000);
      return () => clearInterval(interval);
    }
  }, [clipId]);

  useEffect(() => {
    if (progress) {
      setOldVal(progress);
    }
  }, [progress]);

  const messageBasedOnState = (state: State) => {
    switch (state) {
      case State.ErrorUpload:
        return "Error uploading video";
      case State.ErrorEncoding:
        return "Error encoding video";
      case State.Success:
        return "Video uploaded successfully";
      case State.Uploading:
        return "Uploading...";
      case State.Queued:
        return "Queued...";
      case State.Encoding:
        return "Encoding...";
      case State.Idle:
        return "Upload";
      default:
        return "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      if (title === "") {
        const videoName = droppedFile.name;
        const parsedTitle = videoName.split(".").slice(0, -1).join(" ").replace(/_/g, " ");
        setTitle(parsedTitle);
      }
    }
  };

  const clearFile = () => {
    setFile(undefined);
    setTitle("");
  };

  return (
    <main className="h-full">
      <div className="container w-fit mx-auto flex flex-col space-y-6 justify-center items-center py-3">
        <div className="form-control w-full max-w-xs">
          <label className="label">
            <span className="label-text">Title</span>
          </label>
          <input
            type="text"
            required
            placeholder="Title"
            className="input input-bordered w-full max-w-xs"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
          <label className="label">
            <span className="label-text">Description</span>
          </label>
          <textarea
            required
            placeholder="Description"
            className="textarea textarea-bordered w-full max-w-xs"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
          />
        </div>
        <div
          className="w-full max-w-xs border-2 border-dashed border-gray-400 p-4 text-center cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.querySelector(".file-input")?.click()}
        >
          <p><b>Drag and drop</b> or click to browse</p>
          <p><i>{file ? file.name : title || "No file selected"}</i></p>
          {!file && (
            <input
              type="file"
              className="file-input w-full max-w-xs opacity-0 absolute"
              accept="video/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFile(e.target.files[0]);
                  if (title === "") {
                    const videoName = e.target.files[0].name;
                    const parsedTitle = videoName.split(".").slice(0, -1).join(" ").replace(/_/g, " ");
                    setTitle(parsedTitle);
                  }
                }
              }}
            />
          )}
        </div>
        {file && (
          <p className="text-sm text-blue-500 cursor-pointer" onClick={clearFile}>
            Clear upload
          </p>
        )}

        <label className="label space-x-2 cursor-pointer self-start">
          <span className="label-text">Unlisted</span>
          <input
            type="checkbox"
            checked={unlisted}
            onChange={(e) => {
              setUnlisted(e.target.checked);
            }}
            className="checkbox"
          />
        </label>
        <button className="btn btn-primary w-full max-w-xs" onClick={uploadVideo}>
          {messageBasedOnState(state)}
        </button>
      </div>
      <div className="flex flex-col space-y-6 justify-center items-center py-3">
        {state !== State.Idle && (
          <animated.progress
            className="progress progress-accent w-full max-w-xs justify-center items-center"
            value={barvalue.percent}
            max="100"
          ></animated.progress>
        )}
      </div>
    </main>
  );
}
