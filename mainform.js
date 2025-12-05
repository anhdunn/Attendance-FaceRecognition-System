// ✅ Đợi HTML load xong rồi mới chạy JS
document.addEventListener("DOMContentLoaded", () => {

    // Navbar navigation
    function goHome() { location.href = 'mainform.html'; }
    function goApply() { location.href = 'apply_form.html'; }
    function goTimeSheet() { location.href = 'time_sheet.html'; }
    function goAccount() { location.href = 'account.html'; }

    window.goHome = goHome;
    window.goApply = goApply;
    window.goTimeSheet = goTimeSheet;
    window.goAccount = goAccount;

    // Check-in button → chuyển sang trang check_in.html
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn) {
        checkinBtn.addEventListener('click', () => {
            location.href = 'check_in.html';
        });``
    }

    // ✅ Hiển thị giờ hiện tại
    function updateTime() {
        const now = new Date();
        const timeLabel = document.getElementById('currentTime');
        if (timeLabel) {
            timeLabel.textContent = now.toLocaleTimeString('en-US', { hour12: false });
        }
    }
    setInterval(updateTime, 1000);
    updateTime();

    // ✅ Nhận employeeID từ URL nếu có, và lưu sessionStorage
    const params = new URLSearchParams(window.location.search);
    const employeeID_URL = params.get("employeeID");

    if (employeeID_URL) {
        sessionStorage.setItem("employeeID", employeeID_URL);
    }

    // ✅ Kiểm tra nhân viên đã đăng ký khuôn mặt chưa
    async function checkFaceRegistered() {
        const employeeID = sessionStorage.getItem("employeeID");

        if (!employeeID) {
            console.warn("⚠️ Không tìm thấy employeeID trong sessionStorage");
            return;
        }

        console.log("📌 EmployeeID:", employeeID);

        try {
            const response = await fetch(`http://localhost:5000/api/check-face-registered/${employeeID}`);
            const data = await response.json();

            console.log("✅ Kết quả check-face:", data);

            const updateBtn = document.getElementById("updateFaceBtn");

            if (!updateBtn) {
                console.error("❌ Không tìm thấy nút updateFaceBtn trên HTML");
                return;
            }

            // ✅ Ẩn nút nếu đã có dữ liệu khuôn mặt
            if (data.success && data.registered === true) {
                updateBtn.style.display = "none";
                console.log("🎉 Đã ẩn nút Cập nhật khuôn mặt (có FaceData trong DB)");
            }

        } catch (error) {
            console.error("❌ Lỗi khi gọi API check-face:", error);
        }
    }

    checkFaceRegistered(); // ✅ Gọi sau khi DOM load

// =======================
// Hiển thị Start Work nếu đã check-in
// =======================
const checkinTime = sessionStorage.getItem("checkinTime");

const checkinBtn2 = document.getElementById("checkinBtn");
const startWorkLabel = document.getElementById("startWorkLabel");

if (checkinTime) {
    // Ẩn nút check-in
    if (checkinBtn2) checkinBtn2.style.display = "none";

    // Hiển thị giờ từ DB (chỉ giờ và phút)
    const time = new Date(checkinTime);
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");

    if (startWorkLabel)
        startWorkLabel.textContent = `Start Work: ${hh}:${mm}`;
}

// Ẩn nút check-in nếu đã check in
const checkedInFlag = sessionStorage.getItem("checkedIn");
if (checkedInFlag === "true") {
    const btn = document.getElementById("checkinBtn");
    if (btn) btn.style.display = "none";
}

});

// Nút check out: mở trang check_out.html
const checkoutBtnEl = document.getElementById('checkoutBtn');
if (checkoutBtnEl) {
    checkoutBtnEl.addEventListener('click', () => {
        const employeeID = sessionStorage.getItem("employeeID");
        if (!employeeID) {
            alert("⚠️ Không tìm thấy ID nhân viên. Vui lòng đăng nhập lại!");
            return;
        }
        location.href = 'check_out.html';
    });
}
