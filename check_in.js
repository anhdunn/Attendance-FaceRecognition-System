console.log("✅ check_in.js loaded");

const video = document.getElementById("camera");
const checkinBtn = document.getElementById("checkinBtn");
const successMsg = document.getElementById("successMsg");
let currentStream = null;
let isNavigatingAway = false; // ⬅️ Dùng để tránh lỗi khi back hoặc reload

// --- Bật camera ---
async function startCamera() {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = currentStream;
    console.log("🎥 Camera started");
  } catch (err) {
    console.error("❌ Không thể truy cập camera:", err);
    alert("Không thể truy cập camera. Hãy kiểm tra quyền truy cập.");
  }
}

// --- Tắt camera khi thoát trang ---
window.addEventListener("beforeunload", () => {
  isNavigatingAway = true;
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    console.log("🛑 Camera stopped before leaving page");
  }
});

// --- Load model nhận diện khuôn mặt ---
async function loadModels() {
  console.log("🔄 Đang tải model nhận diện khuôn mặt...");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models")
  ]);
  console.log("✅ Model đã sẵn sàng");
}

// --- Khi video chạy ---
video.addEventListener("play", () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.querySelector(".camera-frame").append(canvas);

  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  async function detectFaces() {
    if (isNavigatingAway) return; // ⬅️ tránh chạy tiếp khi rời trang
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizedDetections.forEach(det => {
      const { x, y, width, height } = det.box;
      ctx.strokeStyle = "lime";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    });
    requestAnimationFrame(detectFaces);
  }

  detectFaces();
});

// --- Nút Check in ---
checkinBtn.addEventListener("click", async () => {
  if (isNavigatingAway) return; // ⬅️ không chạy nếu đang rời trang

  console.log("🟢 Scan button clicked");

  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    showMessage("⚠️ Camera chưa sẵn sàng, vui lòng đợi...", "orange");
    return;
  }

  showMessage("🔍 Đang quét khuôn mặt...", "orange");
  await new Promise(r => setTimeout(r, 300));

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.5
      }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showMessage("❌ Không phát hiện khuôn mặt!", "red");
      return;
    }

// 🔹 Lấy employeeID từ sessionStorage
const employeeID = sessionStorage.getItem("employeeID");
if (!employeeID) {
  showMessage("⚠️ Không tìm thấy ID nhân viên. Vui lòng đăng nhập lại!", "orange");
  return;
}

// 🔹 Gửi descriptor + employeeID lên server để xác minh khuôn mặt
const descriptor = Array.from(detection.descriptor);
const res = await fetch("http://localhost:5000/api/checkin-face", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    employeeID,
    descriptor
  })
});

    const data = await res.json();
    console.log("📦 Response từ server:", data);

    if (isNavigatingAway) return; // ⬅️ tránh log khi người dùng back

    if (data.success) {
      showMessage(data.message || "✅ Check-in thành công!", "lime");
    } else {
      showMessage(data.message || "❌ Không khớp khuôn mặt!", "red");
    }
  } catch (err) {
    if (!isNavigatingAway) {
      console.error("❌ Lỗi khi check-in:", err);
      showMessage("❌ Lỗi khi quét khuôn mặt!", "red");
    }
  }
});

// --- Khởi động ---
(async function init() {
  if (typeof faceapi === "undefined") {
    alert("face-api.min.js chưa tải xong. Hãy tải lại trang.");
    return;
  }
  await loadModels();
  await startCamera();
})();

function showMessage(text, color = "#009900") {
  successMsg.textContent = text;
  successMsg.style.color = color;
  successMsg.classList.add("show");
  setTimeout(() => successMsg.classList.remove("show"), 3500);
}
