console.log("✅ check_out.js loaded");

const video = document.getElementById("camera");
const checkoutBtn = document.getElementById("checkoutBtn"); // nút check-out face
const successMsg = document.getElementById("successMsg");
let currentStream = null;
let isNavigatingAway = false;

// --- Bật camera ---
async function startCamera() {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    video.srcObject = currentStream;
    video.style.transform = "scaleX(-1)"; // mirror cho đẹp
    await video.play();
    console.log("🎥 Camera started");
  } catch (err) {
    console.error("❌ Không thể truy cập camera:", err);
    alert("Không thể truy cập camera. Hãy kiểm tra quyền truy cập.");
  }
}

// --- Tắt camera khi rời trang ---
window.addEventListener("beforeunload", () => {
  isNavigatingAway = true;
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    console.log("🛑 Camera stopped before leaving page");
  }
});

// --- Load faceapi models ---
async function loadModels() {
  console.log("🔄 Đang tải model nhận diện khuôn mặt...");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models")
  ]);
  console.log("✅ Model đã sẵn sàng");
}

// --- Khi video chạy, tạo canvas bám sát video ---
video.addEventListener("playing", async () => {
  const cameraFrame = document.querySelector(".camera-frame");
  cameraFrame.style.position = "relative";

  // Xóa canvas cũ nếu có
  const oldCanvas = cameraFrame.querySelector("canvas");
  if (oldCanvas) oldCanvas.remove();

  // Tạo canvas mới
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  cameraFrame.appendChild(canvas);

  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  // Chạy loop nhận diện
  async function detectFaces() {
    if (isNavigatingAway) return;

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);

const ctx = canvas.getContext("2d");
ctx.clearRect(0, 0, canvas.width, canvas.height);

resizedDetections.forEach(det => {
    const box = det.detection.box;

    // Mirror theo trục X để khớp với video
    const mirroredX = canvas.width - box.x - box.width;

    ctx.strokeStyle = "#00FFFF";
    ctx.lineWidth = 2;
    ctx.strokeRect(mirroredX, box.y, box.width, box.height);
});


    requestAnimationFrame(detectFaces);
  }

  detectFaces();
});

// --- INIT ---
(async function init() {
  if (typeof faceapi === "undefined") {
    alert("face-api.min.js chưa tải xong. Hãy tải lại trang.");
    return;
  }
  await loadModels();
  await startCamera();
})();

// Hiển thị thông báo
function showMessage(text, color = "#009900") {
  successMsg.textContent = text;
  successMsg.style.color = color;
  successMsg.classList.add("show");
  setTimeout(() => successMsg.classList.remove("show"), 3500);
}

// ===============================
// 🔥 XỬ LÝ CHECK-OUT BẰNG KHUÔN MẶT
// ===============================
checkoutBtn.addEventListener("click", doCheckout);

async function doCheckout() {
  console.log("🔍 Bắt đầu scan để check-out...");

  const employeeID = sessionStorage.getItem("employeeID");
  if (!employeeID) {
    showMessage("Không tìm thấy employeeID!", "red");
    return;
  }

  // Quét 1 khuôn mặt duy nhất
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    showMessage("Không phát hiện khuôn mặt!", "red");
    return;
  }

  const descriptor = Array.from(detection.descriptor);

  console.log("📡 Đang gửi API check-out...");

  try {
    const res = await fetch("http://localhost:5000/api/checkout-face", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeID, descriptor })
    });

    const data = await res.json();
    console.log("📥 API trả về:", data);

    if (data.success) {
      showMessage("Check-out thành công!", "lime");
    } else {
      showMessage(data.message || "Check-out thất bại!", "red");
    }

  } catch (err) {
    console.error("❌ Lỗi khi gọi API:", err);
    showMessage("Lỗi kết nối server!", "red");
  }
}
