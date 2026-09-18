import { NextRequest, NextResponse } from "next/server";
import { encryptCyberVidya } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, password } = await req.json();

    if (!rollNumber || !password) {
      return NextResponse.json(
        { success: false, error: "Roll number and password are required" },
        { status: 400 }
      );
    }

    // Encrypt credentials in-memory using CyberVidya's AES-128-CBC cipher
    const encUsername = encryptCyberVidya(rollNumber.trim());
    const encPassword = encryptCyberVidya(password);

    const payload = {
      userName: encUsername,
      password: encPassword,
      device: "WEB",
      version: null,
      reCaptchaToken: null,
    };

    const erpRes = await fetch("https://kiet.cybervidya.net/api/auth/encrypt/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify(payload),
    });

    const data = await erpRes.json();

    if (!erpRes.ok || data.error) {
      const errMsg = data.error?.reason || data.message || "Login failed. Please check credentials.";
      return NextResponse.json({ success: false, error: errMsg }, { status: erpRes.status });
    }

    // Return OTP challenge details to client (zero server-side retention)
    return NextResponse.json({
      success: true,
      data: data.data,
      message: data.message,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
