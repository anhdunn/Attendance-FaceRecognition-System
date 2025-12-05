import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import sql from "mssql/msnodesqlv8.js";
import argon2 from "argon2";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

// import canvas from 'canvas';
// import * as faceapi from '@vladmandic/face-api';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const { Canvas, Image, ImageData } = canvas;
// faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tranngocanhduong0907@gmail.com', 
        pass: 'ulwj iudk ievu bmgo'    }
});
// --- Middleware ---
app.use(cors());
// app.use(express.json());
// app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use(express.json({ limit: "100mb" }));   // ✅ FIX PayloadTooLargeError
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.use("/css", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));
app.use("/", express.static(__dirname));

// --- Serve trang login ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// --- Cấu hình SQL Server ---
const config = {
  connectionString:
    "Driver={ODBC Driver 18 for SQL Server};Server=DESKTOP-5D2L4T3\\SQLAD;Database=HeThongChamCong;Trusted_Connection=Yes;TrustServerCertificate=Yes;Encrypt=no;"
};

// --- Tạo pool kết nối ---
let pool;

(async () => {
  try {
    console.log("🔍 Connecting to SQL Server...");
    pool = await sql.connect(config); 
    console.log("✅ Kết nối SQL Server thành công (Windows Auth)");
  } catch (err) {
    console.error("❌ Kết nối thất bại:");
    console.error(JSON.stringify(err, null, 2));
  }
})();

//request reset
app.post("/request-reset", async (req, res) => {
    const { email } = req.body;

    try {
        const pool = await sql.connect(config);

        const user = await pool.request()
            .input("email", sql.VarChar, email)
            .query(`
                SELECT EmployeeID FROM Employee WHERE E_Email = @email
            `);

        if (user.recordset.length === 0)
            return res.json({ success: false, message: "Email not found" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await pool.request()
            .input("email", sql.VarChar, email)
            .input("code", sql.VarChar, code)
            .query(`
                INSERT INTO PasswordResetCodes(Email, Code) 
                VALUES (@email, @code)
            `);

        await mailer.sendMail({
            from: 'A-CLOCK',
            to: email,
            subject: 'A-CLOCK - Password Reset Code',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f6f6f6;">
                    <div style="max-width: 450px; margin: auto; background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        
                        <h2 style="text-align: center; color: #2c3e50;">🔐 A-CLOCK</h2>
                        <p style="font-size: 15px; color: #444;">
                            You requested a password reset. Below is your verification code:
                        </p>

                        <div style="
                            font-size: 28px;
                            font-weight: bold;
                            text-align: center;
                            margin: 20px 0;
                            padding: 12px 0;
                            background: #2e86de;
                            color: white;
                            border-radius: 8px;
                            letter-spacing: 4px;">
                            ${code}
                        </div>

                        <p style="color: #555;">This code is valid for <b>5 minutes</b>. Do not share this code with anyone.</p>

                        <p style="font-size: 13px; color: #888; margin-top: 25px; text-align: center;">
                            © 2025 A-CLOCK
                        </p>

                    </div>
                </div>
            `
        });

        res.json({ success: true, message: "Verification code sent!" });
    }
    catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

//verify code
app.post("/verify-code", async (req, res) => {
    const { email, code } = req.body;

    try {
        const pool = await sql.connect(config);

        const result = await pool.request()
            .input("email", sql.VarChar, email)
            .input("code", sql.VarChar, code)
            .query(`
                SELECT * FROM PasswordResetCodes
                WHERE Email = @email AND Code = @code AND Expired = 0
            `);

        if (result.recordset.length === 0)
            return res.json({ success: false, message: "Invalid code" });

        await pool.request()
            .input("email", sql.VarChar, email)
            .query(`
                UPDATE PasswordResetCodes SET Expired = 1 WHERE Email = @email
            `);

        res.json({ success: true });
    }
    catch (err) {
        res.json({ success: false });
    }
});

//Reset password
app.post("/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const pool = await sql.connect(config);

        const hashed = await argon2.hash(newPassword, {
            type: argon2.argon2id,
            timeCost: 4,
            memoryCost: 2 ** 16,
            parallelism: 2
        });

        await pool.request()
            .input("email", sql.VarChar, email)
            .input("pass", sql.NVarChar, hashed)
            .query(`
                UPDATE Users
                SET Password = @pass
                WHERE EmployeeID = (SELECT EmployeeID FROM Employee WHERE E_Email = @email)
            `);

        res.json({ success: true, message: "Password updated!" });
    }
    catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});




//API: Login 
app.post("/login", async (req, res) => {
  const { employeeID, password } = req.body;
  if (!employeeID || !password)
    return res.json({ success: false, message: "Missing fields" });

  try {
    if (!pool) return res.status(500).json({ success: false, message: "Database not ready" });

    const result = await pool
      .request()
      .input("empID", sql.BigInt, employeeID)
      .query(`
        SELECT u.Password, e.E_FullName, u.Role
        FROM Users u
        JOIN Employee e ON u.EmployeeID = e.EmployeeID
        WHERE u.EmployeeID=@empID
      `);

    if (result.recordset.length === 0)
      return res.json({ success: false, message: "Employee not found" });

    const user = result.recordset[0];
    const valid = await argon2.verify(user.Password, password);
    if (!valid) return res.json({ success: false, message: "Invalid password" });

    res.json({
        success: true,
        employee: {
            EmployeeID: employeeID,
            FullName: user.E_FullName,
            Role: user.Role,
        }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

//API lấy chi tiết ngày (hiển thị ở HistoryScreen.js)
app.get("/api/get-attendance-month", async (req, res) => {
  const { employeeID, month, year } = req.query;

  if (!employeeID || !month || !year) 
    return res.json({ success: false, message: "Missing parameters" });

  try {
    if (!pool) return res.status(500).json({ success: false, message: "Database not ready" });

    // Lấy ngày đầu và cuối tháng
    const startDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    const result = await pool
      .request()
      .input("empID", sql.BigInt, employeeID)
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate)
      .query(`
        SELECT WorkDate,
               CheckIn,
               CheckOut,
               CASE 
                 WHEN CheckIn IS NULL THEN 'Absent'
                 WHEN CAST(CheckIn AS time) > '09:00' THEN 'Late'
                 ELSE 'OnTime'
               END AS Status
        FROM Attendance
        WHERE EmployeeID=@empID AND WorkDate BETWEEN @startDate AND @endDate
      `);

    const records = {};
    result.recordset.forEach(row => {
      const dateStr = row.WorkDate.toISOString().slice(0, 10);
      records[dateStr] = { status: row.Status };
    });

    res.json({ success: true, records });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});


//API: Register Department 
app.post("/api/register-department", async (req, res) => {
  try {
    const { DepartmentID, DepartmentName } = req.body;
    if (!DepartmentID || !DepartmentName)
      return res.json({ success: false, message: "Missing fields" });

    const poolConn = await sql.connect(config);

    // Kiểm tra trùng ID
    const exists = await poolConn.request()
      .input("DepartmentID", sql.NVarChar(10), DepartmentID)
      .query("SELECT DepartmentID FROM Department WHERE DepartmentID = @DepartmentID");

    if (exists.recordset.length > 0) {
      return res.json({ success: false, message: "Department already exists!" });
    }

    await poolConn.request()
      .input("DepartmentID", sql.NVarChar(10), DepartmentID)
      .input("DepartmentName", sql.NVarChar(255), DepartmentName)
      .query("INSERT INTO Department (DepartmentID, DepartmentName) VALUES (@DepartmentID, @DepartmentName)");

    res.json({ success: true, message: "Department registered successfully!" });

  } catch (err) {
    console.error("❌ Register department error:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

//API: Lấy danh sách department dropdown để register account
app.get('/api/departments/dropdown', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT DepartmentID, DepartmentName FROM Department');

    res.json({
      success: true,
      departments: result.recordset
    });
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.json({ success: false, message: err.message });
  }
});

//API: Register Account
app.post("/api/register", async (req, res) => {
  try {
    const { employeeID, fullName, dob, gender, phone, address, position, email, department, password, role } = req.body;

    if (!employeeID || !fullName || !dob || !gender || !position ||  !email || !department || !password || !role) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const hashedPassword = await argon2.hash(password);
    const pool = await sql.connect(config);

    console.log("📤 Incoming data:", req.body);

    const dobValue = new Date(dob);
    if (isNaN(dobValue)) {
      return res.status(400).json({ success: false, message: "Invalid Date of Birth format" });
    }

    await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .input("E_FullName", sql.NVarChar(255), fullName)
      .input('E_DOB', sql.Date, dob)
      .input("E_Gender", sql.NVarChar(10), gender)
      .input("E_Phone", sql.NVarChar(15), phone && phone.trim() !== "" ? phone.trim() : null)
      .input("E_Address", sql.NVarChar(sql.MAX), address && address.trim() !== "" ? address.trim() : null)
      .input("E_FaceData", sql.NVarChar(sql.MAX), null)
      .input("E_Position", sql.NVarChar(255), position)
      .input("E_Email", sql.NVarChar(255), email)
      .input("Status", sql.NVarChar(100), "Active")
      .input("DepartmentID", sql.NVarChar(10), department)
      .query(`
        INSERT INTO Employee 
        (EmployeeID, E_FullName, E_DOB, E_Gender, E_Phone, E_Address, E_FaceData, E_Position, E_Email, Status, DepartmentID)
        VALUES (@EmployeeID, @E_FullName, @E_DOB, @E_Gender, @E_Phone, @E_Address, @E_FaceData, @E_Position, @E_Email, @Status, @DepartmentID)
      `);

    await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .input("Password", sql.NVarChar(255), hashedPassword)
      .input("Role", sql.VarChar(100), role)
      .query(`
        INSERT INTO Users (EmployeeID, Password, Role)
        VALUES (@EmployeeID, @Password, @Role)
      `);

    res.json({ success: true, message: "✅ Employee registered successfully! Please log in to register face data." });

  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ success: false, message: "Error registering employee: " + err.message });
  }
});

//API lấy thống kê tổng (trang admin)
app.get("/api/stats", async (req, res) => {
  try {
    let pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Employee) AS totalEmployees,
        (SELECT COUNT(*) FROM Department) AS totalDepartments,
        (SELECT COUNT(*) 
         FROM Attendance 
         WHERE CAST(WorkDate AS date) = CAST(GETDATE() AS date)) AS attendanceToday
    `);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error fetching stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//API: Department list (admin) 
app.get("/api/departments", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT * FROM Department");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error fetching departments:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//API: Employee list (admin) 
app.get("/api/employees", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT 
        e.EmployeeID,
        e.E_FullName AS FullName,
        e.E_Phone AS Phone,
        e.E_Position AS Position,
        d.DepartmentName
      FROM Employee e
      JOIN Department d ON e.DepartmentID = d.DepartmentID
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ error: "Failed to load employees" });
  }
});

// Lấy danh sách ca làm
app.get("/api/calam", async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM CaLam`;
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error fetching shifts:", err);
    res.status(500).json({ message: "Error loading data" });
  }
});

// Thêm ca làm mới
app.post("/api/calam", async (req, res) => {
  try {
    const { CaName, StartTime, EndTime } = req.body;
    if (!CaName || !StartTime || !EndTime)
      return res.status(400).json({ message: "Missing required fields" });

    await sql.query`
      INSERT INTO CaLam (CaName, StartTime, EndTime)
      VALUES (${CaName}, ${StartTime}, ${EndTime})
    `;
    res.status(201).json({ message: "Added successfully" });
  } catch (err) {
    console.error("❌ Error adding shift:", err);
    res.status(500).json({ message: "Error adding shift" });
  }
});

// Xóa ca làm
app.delete("/api/calam/:name", async (req, res) => {
  try {
    const { name } = req.params;
    await sql.query`DELETE FROM CaLam WHERE CaName = ${name}`;
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting shift:", err);
    res.status(500).json({ message: "Error deleting shift" });
  }
});

// GET chi tiết 1 ca
app.get("/api/shifts/:CaName", async (req, res) => {
  const { CaName } = req.params;
  try {
    const result = await sql.query`SELECT * FROM CaLam WHERE CaName = ${CaName}`;
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).send("Error fetching shift");
  }
});

// PUT cập nhật ca
app.put("/api/shifts/:CaName", async (req, res) => {
  const { CaName } = req.params;
  const { StartTime, EndTime } = req.body;

  try {
    await sql.query`
      UPDATE CaLam
      SET 
        StartTime = CAST(${StartTime} AS time),
        EndTime = CAST(${EndTime} AS time)
      WHERE CaName = ${CaName}`;
      
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error updating shift:", err);
    res.status(500).send("Error updating shift");
  }
});

// GET all schedules (JOIN Employee để lấy tên nhân viên)
app.get("/api/schedule", async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT 
        WS.EmployeeID, 
        E.E_FullName, 
        WS.CaName, 
        WS.WorkDate
      FROM WorkSchedule WS
      JOIN Employee E ON WS.EmployeeID = E.EmployeeID
      ORDER BY WS.WorkDate DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error fetching schedules:", err);
    res.status(500).send("Error fetching schedules");
  }
});


// GET 1 schedule by EmployeeID + CaName + WorkDate
app.get("/api/schedule/:EmployeeID/:CaName/:WorkDate", async (req, res) => {
  const { EmployeeID, CaName, WorkDate } = req.params;
  try {
    const result = await sql.query`
      SELECT * FROM WorkSchedule
      WHERE EmployeeID = ${EmployeeID} AND CaName = ${CaName} AND WorkDate = ${WorkDate}
    `;
    if (result.recordset.length === 0)
      return res.status(404).send("Schedule not found");
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error fetching schedule:", err);
    res.status(500).send("Error fetching schedule");
  }
});


// POST - Add new schedule
app.post("/api/schedule", async (req, res) => {
  const { EmployeeID, CaName, WorkDate } = req.body;
  try {
    // Kiểm tra trùng khóa
    const check = await sql.query`
      SELECT 1 FROM WorkSchedule
      WHERE EmployeeID = ${EmployeeID} AND CaName = ${CaName} AND WorkDate = ${WorkDate}
    `;
    if (check.recordset.length > 0)
      return res.status(400).send("Schedule already exists");

    await sql.query`
      INSERT INTO WorkSchedule (EmployeeID, CaName, WorkDate)
      VALUES (${EmployeeID}, ${CaName}, ${WorkDate})
    `;
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error inserting schedule:", err);
    res.status(500).send("Error adding schedule");
  }
});


// PUT - Update existing schedule
app.put("/api/schedule/:EmployeeID/:CaName/:WorkDate", async (req, res) => {
  const { EmployeeID, CaName, WorkDate } = req.params;
  const { CaName: NewCa, WorkDate: NewDate } = req.body;
  try {
    const result = await sql.query`
      UPDATE WorkSchedule
      SET CaName = ${NewCa}, WorkDate = ${NewDate}
      WHERE EmployeeID = ${EmployeeID} AND CaName = ${CaName} AND WorkDate = ${WorkDate}
    `;
    if (result.rowsAffected[0] === 0)
      return res.status(404).send("Schedule not found");
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error updating schedule:", err);
    res.status(500).send("Error updating schedule");
  }
});


// DELETE - Remove schedule
app.delete("/api/schedule/:EmployeeID/:CaName/:WorkDate", async (req, res) => {
  const { EmployeeID, CaName, WorkDate } = req.params;
  try {
    const result = await sql.query`
      DELETE FROM WorkSchedule
      WHERE EmployeeID = ${EmployeeID} AND CaName = ${CaName} AND WorkDate = ${WorkDate}
    `;
    if (result.rowsAffected[0] === 0)
      return res.status(404).send("Schedule not found");
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error deleting schedule:", err);
    res.status(500).send("Error deleting schedule");
  }
});

// Đơn xin phép
app.post("/api/leave-request", async (req, res) => {
  try {
    const { EmployeeID, LeaveType, StartDate, EndTime, Reason } = req.body;

    if (!EmployeeID || !LeaveType || !StartDate || !EndTime || !Reason) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const poolConn = await sql.connect(config);

    await poolConn.request()
      .input("EmployeeID", sql.BigInt, EmployeeID)
      .input("LeaveType", sql.NVarChar(100), LeaveType)
      .input("StartDate", sql.Date, StartDate)
      .input("EndTime", sql.Date, EndTime)
      .input("Reason", sql.NVarChar(sql.MAX), Reason)
      .input("Status", sql.NVarChar(50), "Pending") // mặc định khi gửi sẽ là Pending
      .query(`
          INSERT INTO LeaveRequest (EmployeeID, LeaveType, StartDate, EndTime, Reason, Status)
          VALUES (@EmployeeID, @LeaveType, @StartDate, @EndTime, @Reason, @Status)
      `);

    res.status(200).json({ success: true, message: "Leave request submitted!" });

  } catch (err) {
    console.error("❌ Error submit request:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API lấy danh sách yêu cầu pending
app.get("/api/leave-requests-list", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT lr.LeaveRequestID, lr.EmployeeID, e.E_FullName AS EmployeeName, 
             lr.LeaveType, lr.StartDate, lr.EndTime, lr.Reason, lr.RequestDate
      FROM LeaveRequest lr
      JOIN Employee e ON lr.EmployeeID = e.EmployeeID
      WHERE lr.Status = 'Pending'
      ORDER BY lr.RequestDate ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load leave requests" });
  }
});

// API duyệt request
app.post("/api/approve-leave", async (req, res) => {
  const { LeaveRequestID, Status, ApprovedBy } = req.body;
  if (!LeaveRequestID || !Status || !ApprovedBy)
    return res.status(400).json({ success: false, message: "Missing data" });

  try {
    const pool = await sql.connect(config);
    await pool.request()
      .input("LeaveRequestID", LeaveRequestID)
      .input("Status", Status)
      .input("ApprovedBy", ApprovedBy)
      .query(`
        UPDATE LeaveRequest
        SET Status = @Status, ApprovedBy = @ApprovedBy
        WHERE LeaveRequestID = @LeaveRequestID
      `);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to approve leave" });
  }
});


//Lấy lịch sử yêu cầu cho nhân viên 
app.get("/api/leave-request/history/:EmployeeID", async (req, res) => {
  const { EmployeeID } = req.params;

  try {
    const poolConn = await sql.connect(config);

    const result = await poolConn.request()
      .input("EmployeeID", sql.BigInt, EmployeeID)
      .query(`
        SELECT LeaveRequestID, LeaveType, StartDate, EndTime, Reason, Status
        FROM LeaveRequest
        WHERE EmployeeID = @EmployeeID
        ORDER BY LeaveRequestID DESC
      `);

    res.json({ success: true, history: result.recordset });

  } catch (err) {
    console.error("❌ Error fetching leave request history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

//load dữ liệu biểu đồ
app.get("/api/attendance/chart", async (req, res) => {
  const { filter } = req.query;

  const result = await sql.query(`
      SELECT DayName, LateCount, AbsentCount, OnTimeRate
      FROM AttendanceStats
      WHERE FilterType = '${filter}'
  `);

  res.json({
    labels: result.recordset.map(r => r.DayName),
    late: result.recordset.map(r => r.LateCount),
    absent: result.recordset.map(r => r.AbsentCount),
    ontimeRate: result.recordset.map(r => r.OnTimeRate),
  });
});

//lấy thống kê cho trang Timesheet 
app.get("/api/timesheet/:employeeID", async (req, res) => {
    const { employeeID } = req.params;

    const query = `
        SELECT WorkDate AS date, CheckInTime AS checkIn, CheckOutTime AS checkOut
        FROM TimeSheet
        WHERE EmployeeID = @employeeID
        ORDER BY WorkDate ASC
    `;

    try {
        const pool = await sql.connect(config);

        const result = await pool.request()
            .input("employeeID", sql.VarChar, employeeID)
            .query(query);

        res.json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API lấy danh sách nhân viên(manager)
app.get("/api/team-members", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT 
        e.EmployeeID,
        e.E_FullName AS FullName,
        e.E_Phone AS Phone,
        e.E_Position AS Position,
        ISNULL(d.DepartmentName, 'No Department') AS DepartmentName
      FROM Employee e
      LEFT JOIN Department d ON e.DepartmentID = d.DepartmentID
      WHERE e.Status = 'Active'
      ORDER BY e.E_Position, e.E_FullName
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load team members" });
  }
});

// --- API: Check-in ---
app.post("/api/checkin", async (req, res) => {
  const { EmployeeID } = req.body;
  try {
    if (!pool) return res.status(500).json({ success: false, msg: "Database not ready" });

    const today = new Date().toISOString().slice(0, 10);
    const schedule = await pool
      .request()
      .input("empId", sql.BigInt, EmployeeID)
      .input("today", sql.Date, today)
      .query(
        `SELECT * FROM WorkSchedule WHERE EmployeeID=@empId AND WorkDate=@today`
      );

    if (schedule.recordset.length === 0)
      return res.json({ success: false, msg: "No schedule today" });

    const ca = schedule.recordset[0].CaName;
    const checkInTime = new Date();

    await pool
      .request()
      .input("empId", sql.BigInt, EmployeeID)
      .input("ca", sql.NVarChar(10), ca)
      .input("checkIn", sql.DateTime, checkInTime)
      .input("workDate", sql.Date, today)
      .query(`
        INSERT INTO Attendance(EmployeeID, CaName, CheckIn, CheckOut, WorkDate)
        VALUES(@empId, @ca, @checkIn, NULL, @workDate)
      `);

    res.json({ success: true, msg: "Check-in successful", CaName: ca });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: err.message });
  }
});

// --- API: Match Face ---
app.post("/api/match-face", async (req, res) => {
  const inputDesc = req.body.descriptor;
  try {
    if (!pool) return res.status(500).json({ matched: false, error: "Database not ready" });

    const result = await pool
      .request()
      .query("SELECT EmployeeID, E_FullName, E_FaceData FROM Employee");

    for (const emp of result.recordset) {
      if (!emp.E_FaceData) continue;
      const savedDesc = JSON.parse(emp.E_FaceData);
      let dist = 0;
      for (let i = 0; i < 128; i++) dist += (savedDesc[i] - inputDesc[i]) ** 2;
      dist = Math.sqrt(dist);
      if (dist < 0.6)
        return res.json({
          matched: true,
          EmployeeID: emp.EmployeeID,
          EmployeeName: emp.E_FullName
        });
    }
    res.json({ matched: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ matched: false, error: err.message });
  }
});

// --- API: Face-based Check-in (so khớp khuôn mặt và cập nhật cho nhân viên đang đăng nhập) ---
app.post("/api/checkin-face", async (req, res) => {
  try {
    const { employeeID, descriptor } = req.body;
    if (!employeeID || !descriptor) {
      return res.json({ success: false, message: "Thiếu dữ liệu nhận diện!" });
    }

    if (!pool) return res.status(500).json({ success: false, message: "Database not ready" });

    // 🔹 Lấy dữ liệu khuôn mặt trong DB
    const result = await pool.request()
      .input("employeeID", sql.BigInt, employeeID)
      .query("SELECT E_FaceData FROM Employee WHERE EmployeeID = @employeeID");

    if (result.recordset.length === 0)
      return res.json({ success: false, message: "Không tìm thấy nhân viên!" });

    const dbFace = result.recordset[0].E_FaceData;
    if (!dbFace)
      return res.json({ success: false, message: "Nhân viên chưa đăng ký khuôn mặt!" });

    // 🔹 So sánh khuôn mặt
    const faceDescriptorDB = JSON.parse(dbFace);
    let dist = 0;
    for (let i = 0; i < 128; i++) dist += (descriptor[i] - faceDescriptorDB[i]) ** 2;
    dist = Math.sqrt(dist);

    console.log(`📏 Khoảng cách khuôn mặt của ${employeeID}: ${dist}`);

    if (dist > 0.6)
      return res.json({ success: false, message: "❌ Khuôn mặt không khớp!" });

    // 🔹 Kiểm tra lịch làm việc hôm nay
    const today = new Date().toISOString().slice(0, 10);
    const caResult = await pool.request()
      .input("employeeID", sql.BigInt, employeeID)
      .input("today", sql.Date, today)
      .query("SELECT TOP 1 CaName FROM WorkSchedule WHERE EmployeeID=@employeeID AND WorkDate=@today");

    if (caResult.recordset.length === 0)
      return res.json({ success: false, message: "Không có lịch làm việc hôm nay!" });

    const caName = caResult.recordset[0].CaName;

    // 🔹 Kiểm tra đã check-in chưa
    const checkExists = await pool.request()
      .input("employeeID", sql.BigInt, employeeID)
      .input("today", sql.Date, today)
      .input("caName", sql.NVarChar(10), caName)
      .query("SELECT * FROM Attendance WHERE EmployeeID=@employeeID AND WorkDate=@today AND CaName=@caName");

    if (checkExists.recordset.length > 0)
      return res.json({ success: false, message: "Bạn đã check-in ca này rồi!" });

    // 🔹 Lưu check-in vào bảng Attendance
    await pool.request()
      .input("employeeID", sql.BigInt, employeeID)
      .input("caName", sql.NVarChar(10), caName)
      .input("today", sql.Date, today)
      .query("INSERT INTO Attendance (EmployeeID, CaName, CheckIn, Status, WorkDate) VALUES (@employeeID, @caName, GETDATE(), N'Pending', @today)");

    console.log(`✅ ${employeeID} check-in thành công!`);
    res.json({ success: true, message: "✅ Check-in thành công!" });

  } catch (err) {
    console.error("❌ Lỗi khi xử lý check-in:", err);
    res.json({ success: false, message: "Lỗi server khi check-in!" });
  }
});

// --- API: Cập nhật dữ liệu khuôn mặt cho nhân viên đang đăng nhập ---
app.post("/api/update-face", async (req, res) => {
  const { EmployeeID, descriptor } = req.body;

  if (!EmployeeID || !descriptor) {
    return res.status(400).json({ success: false, message: "Missing data" });
  }

  try {
    if (!pool) return res.status(500).json({ success: false, message: "Database not ready" });

    await pool.request()
      .input("id", sql.BigInt, EmployeeID)
      .input("desc", sql.NVarChar(sql.MAX), JSON.stringify(descriptor))
      .query("UPDATE Employee SET E_FaceData = @desc WHERE EmployeeID = @id");

    res.json({ success: true, message: "✅ Face data updated successfully!" });
  } catch (err) {
    console.error("❌ Update face error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- API: Lưu dữ liệu khuôn mặt (descriptor + ảnh gốc) ---
app.post("/api/save-face", async (req, res) => {
  try {
    const { EmployeeID, imageData } = req.body;

    if (!EmployeeID || !imageData) {
      return res
        .status(400)
        .json({ success: false, message: "Missing EmployeeID or image data" });
    }

    await pool
      .request()
      .input("id", sql.BigInt, EmployeeID)
      .input("face", sql.NVarChar(sql.MAX), imageData)
      .query("UPDATE Employee SET E_FaceData = @face WHERE EmployeeID = @id");

    return res.json({
      success: true,
      message: "✅ Khuôn mặt đã lưu vào SQL thành công!"
    });
  } catch (err) {
    console.error("❌ Lỗi lưu khuôn mặt:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Kiểm tra đã đăng kí khuôn mặt chưa để ẩn nút "Register Face" ở HomScreen
app.get("/api/check-face-registered/:employeeID", async (req, res) => {
  try {
    const employeeID = req.params.employeeID;

    const result = await pool.request()
      .input("employeeID", sql.BigInt, employeeID)
      .query("SELECT E_FaceData FROM Employee WHERE EmployeeID = @employeeID");

    if (result.recordset.length === 0)
      return res.json({ success: false, registered: false, message: "Không tìm thấy nhân viên!" });

    const faceData = result.recordset[0].E_FaceData;

    if (!faceData || faceData === "")
      return res.json({ success: true, registered: false });

    res.json({ success: true, registered: true });

  } catch (err) {
    console.error("❌ API check-face-registered error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// --- API: Get Employee Info ---
app.get("/api/get-employee", async (req, res) => {
  const employeeID = req.query.employeeID;
  if (!employeeID) return res.json({ success: false, error: "Missing EmployeeID" });

  try {
    if (!pool) return res.status(500).json({ success: false, error: "Database not ready" });

    const result = await pool
      .request()
      .input("employeeID", sql.BigInt, employeeID)
      .query(`
        SELECT E_FullName, E_Position, DepartmentID, E_Gender, E_DOB
        FROM Employee WHERE EmployeeID=@employeeID
      `);

    if (result.recordset.length === 0)
      return res.json({ success: false, error: "Employee not found" });

    res.json({ success: true, employee: result.recordset[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==== ĐỔI MẬT KHẨU (CÓ MÃ HÓA ARGON2) ====
app.post('/api/change-password', async (req, res) => {
  try {
    const { employeeID, oldPassword, newPassword } = req.body;

    if (!employeeID) {
      return res.status(401).json({ message: "User not logged in." });
    }

    // ✅ Lấy mật khẩu hiện tại từ bảng Users
    const checkQuery = `
      SELECT Password 
      FROM Users 
      WHERE EmployeeID = @employeeID
    `;
    const checkResult = await pool.request()
      .input('employeeID', sql.BigInt, employeeID)
      .query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const currentPassword = checkResult.recordset[0].Password;

    // ✅ So sánh mật khẩu cũ (đã mã hóa)
    const valid = await argon2.verify(currentPassword, oldPassword);
    if (!valid) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    // ✅ Hash mật khẩu mới
    const hashedPassword = await argon2.hash(newPassword);

    // ✅ Cập nhật mật khẩu trong bảng Users
    const updateQuery = `
      UPDATE Users
      SET Password = @newPassword
      WHERE EmployeeID = @employeeID
    `;
    await pool.request()
      .input('newPassword', sql.NVarChar, hashedPassword)
      .input('employeeID', sql.BigInt, employeeID)
      .query(updateQuery);

    res.json({ message: "Password changed successfully." });

  } catch (error) {
    console.error("❌ Error changing password details:", error.message, error.stack);
    res.status(500).json({ message: "Server error while changing password." });
  }
});



app.listen(5000, "0.0.0.0", () => {
  console.log("✅ Server running on http://192.168.1.10:5000");
});

// Tính khoảng cách Euclid giữa 2 vector descriptor
function euclideanDistance(desc1, desc2) {
    if (!desc1 || !desc2 || desc1.length !== desc2.length) return 9999;

    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
        const diff = desc1[i] - desc2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
// ==========================
// ✅ API: CHECK-OUT WITH FACE (CHUẨN THEO DATABASE)
// ==========================
app.post("/api/checkout-face", async (req, res) => {
  try {
    const { employeeID, descriptor } = req.body;

    if (!employeeID || !descriptor) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu nhận dạng khuôn mặt!" });
    }

    // ==========================
    // 1️⃣ Lấy dữ liệu khuôn mặt từ DB
    // ==========================
    const result = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .query("SELECT E_FaceData FROM Employee WHERE EmployeeID = @EmployeeID");

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhân viên!" });
    }

    const storedDescriptor = JSON.parse(result.recordset[0].E_FaceData || "[]");
    if (!storedDescriptor.length) {
      return res.json({ success: false, message: "Chưa có dữ liệu khuôn mặt trong hệ thống!" });
    }

    // so sánh mặt
    const distance = euclideanDistance(descriptor, storedDescriptor);
    console.log("📏 Face distance:", distance);

    if (distance > 0.45) {
      return res.json({ success: false, message: "❌ Khuôn mặt không khớp!" });
    }

    // ==========================
    // 2️⃣ Lấy CA làm hôm nay
    // ==========================
    const schedule = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .query(`
        SELECT CaName 
        FROM WorkSchedule
        WHERE EmployeeID = @EmployeeID
        AND WorkDate = CAST(GETDATE() AS DATE)
      `);

    if (schedule.recordset.length === 0) {
      return res.json({ success: false, message: "❌ Bạn không có lịch làm hôm nay!" });
    }

    const caName = schedule.recordset[0].CaName;

    // ==========================
    // 3️⃣ Kiểm tra đã CHECK-IN ca này chưa
    // ==========================
    const attendance = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .input("CaName", sql.NVarChar, caName)
      .query(`
        SELECT TOP 1 *
        FROM Attendance
        WHERE EmployeeID = @EmployeeID
          AND CaName = @CaName
          AND WorkDate = CAST(GETDATE() AS DATE)
          AND CheckIn IS NOT NULL
          AND (Status <> N'On Leave - Approved' OR Status IS NULL)
        ORDER BY AttendanceID DESC
      `);

    if (attendance.recordset.length === 0) {
      return res.json({ success: false, message: "⚠️ Bạn chưa Check-in ca hôm nay!" });
    }

    const att = attendance.recordset[0];

    // ==========================
    // 4️⃣ Kiểm tra đã CHECK-OUT chưa
    // ==========================
    if (att.CheckOut !== null) {
      return res.json({ success: false, message: "⚠️ Bạn đã Check-out rồi!" });
    }

    // ==========================
    // 5️⃣ Cập nhật CHECK-OUT
    // ==========================
    await pool.request()
      .input("ID", sql.Int, att.AttendanceID)
      .input("CheckOut", sql.DateTime, new Date())
      .query(`
        UPDATE Attendance
        SET CheckOut = @CheckOut,
            Status = N'Checked Out'
        WHERE AttendanceID = @ID
      `);

    res.json({
      success: true,
      message: "✅ Check-out thành công!",
      time: new Date().toLocaleTimeString()
    });

  } catch (err) {
    console.error("❌ Lỗi khi Check-out:", err);
    res.status(500).json({ success: false, message: "Lỗi server khi Check-out!" });
  }
});


// ==========================
// ✅ API: CHECK-OUT WITH PASSWORD (CHUẨN THEO DATABASE)
// ==========================

app.post("/api/checkout-pw", async (req, res) => {
  try {
    const { employeeID, password } = req.body;

    if (!employeeID || !password) {
      return res.json({ success: false, message: "Thiếu dữ liệu!" });
    }

    // ================================
    // 1️⃣ LẤY MẬT KHẨU HASH TỪ BẢNG USERS
    // ================================
    const result = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .query(`
        SELECT Password 
        FROM Users 
        WHERE EmployeeID = @EmployeeID
      `);

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy tài khoản!" });
    }

    const hashedPassword = result.recordset[0].Password;

    // ================================
    // 2️⃣ KIỂM TRA MẬT KHẨU (ARGON2)
    // ================================
    const isCorrect = await argon2.verify(hashedPassword, password);
    if (!isCorrect) {
      return res.json({ success: false, message: "❌ Mật khẩu không đúng!" });
    }

    // ================================
    // 3️⃣ LẤY CA LÀM HÔM NAY
    // ================================
    const schedule = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .query(`
        SELECT CaName 
        FROM WorkSchedule
        WHERE EmployeeID = @EmployeeID
          AND WorkDate = CAST(GETDATE() AS DATE)
      `);

    if (schedule.recordset.length === 0) {
      return res.json({ success: false, message: "❌ Bạn không có lịch làm hôm nay!" });
    }

    const caName = schedule.recordset[0].CaName;

    // ================================
    // 4️⃣ LẤY DỮ LIỆU CHECK-IN HÔM NAY
    // ================================
    const attendance = await pool.request()
      .input("EmployeeID", sql.BigInt, employeeID)
      .input("CaName", sql.NVarChar, caName)
      .query(`
        SELECT TOP 1 *
        FROM Attendance
        WHERE EmployeeID = @EmployeeID
          AND CaName = @CaName
          AND WorkDate = CAST(GETDATE() AS DATE)
          AND CheckIn IS NOT NULL
        ORDER BY AttendanceID DESC
      `);

    if (attendance.recordset.length === 0) {
      return res.json({ success: false, message: "⚠️ Bạn chưa Check-in hôm nay!" });
    }

    const att = attendance.recordset[0];

    // ================================
    // 5️⃣ KIỂM TRA ĐÃ CHECK-OUT CHƯA
    // ================================
    if (att.CheckOut !== null) {
      return res.json({ success: false, message: "⚠️ Bạn đã Check-out rồi!" });
    }

    // ================================
    // 6️⃣ CẬP NHẬT CHECK-OUT
    // ================================
    await pool.request()
      .input("ID", sql.Int, att.AttendanceID)
      .query(`
        UPDATE Attendance
        SET 
            CheckOut = GETDATE(),
            Status = N'Checked Out'
        WHERE AttendanceID = @ID
      `);


    return res.json({
      success: true,
      message: "✅ Check-out thành công!",
      time: new Date().toLocaleTimeString()
    });

  } catch (err) {
    console.error("❌ Lỗi /checkout-pw:", err);
    return res.status(500).json({ success: false, message: "Lỗi server khi Check-out!" });
  }
});


//API status attendance employee
app.get("/api/status/:employeeID", async (req, res) => {
    const id = req.params.employeeID;

    try {
        const record = await db.collection("attendance").findOne({ employeeID: id });

        if (!record) {
            return res.json({
                checkInTime: null,
                checkOutTime: null
            });
        }

        res.json({
            checkInTime: record.checkInTime || null,
            checkOutTime: record.checkOutTime || null
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/api/attendance-status", async (req, res) => {
    const employeeID = req.query.employeeID;

    if (!employeeID) {
        return res.status(400).json({ success: false, message: "Missing employeeID" });
    }

    try {
        const pool = await sql.connect(config);

        const result = await pool.request()
            .input("EmployeeID", sql.BigInt, employeeID)
            .query(`
                SELECT 
                    AttendanceID,
                    CaName,
                    CONVERT(VARCHAR(19), CheckIn, 120) AS CheckIn,
                    CONVERT(VARCHAR(19), CheckOut, 120) AS CheckOut,
                    Status,
                    CONVERT(VARCHAR(10), WorkDate, 120) AS WorkDate
                FROM Attendance
                WHERE EmployeeID = @EmployeeID
                ORDER BY WorkDate DESC
            `);

        return res.json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error("Error loading attendance:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
});




