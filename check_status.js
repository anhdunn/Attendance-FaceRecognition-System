document.addEventListener("DOMContentLoaded", async () => {
    // Lấy employeeID từ sessionStorage
    const employeeID = sessionStorage.getItem("employeeID");

    if (!employeeID) {
        alert("⚠ Không tìm thấy ID nhân viên. Vui lòng đăng nhập lại.");
        window.location.href = "login.html";
        return;
    }

    // Hiển thị EmployeeID lên UI (nếu có thẻ span)
    const empSpan = document.getElementById("emp_id");
    if (empSpan) empSpan.textContent = employeeID;

    try {
        // Gọi API đúng!
        const res = await fetch(`/api/attendance-status?employeeID=${employeeID}`);
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            document.getElementById("status_text").textContent = "Chưa có dữ liệu chấm công.";
            return;
        }

        // Dữ liệu gần nhất
        const latest = data.data[0];

        document.getElementById("status_text").textContent =
            `Check-in: ${latest.CheckIn || "Chưa có"}`;

        document.getElementById("status_out").textContent =
            `Check-out: ${latest.CheckOut || "Chưa có"}`;

        // Hiển thị thêm nếu muốn
        const workDate = document.getElementById("work_date");
        if (workDate) workDate.textContent = latest.WorkDate;

    } catch (err) {
        console.error("Lỗi:", err);
        alert("Lỗi khi tải trạng thái chấm công!");
    }
});
