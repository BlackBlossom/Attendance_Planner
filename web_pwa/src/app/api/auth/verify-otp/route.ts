import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { otp, transactionId } = await req.json();

    if (!otp || !transactionId) {
      return NextResponse.json(
        { success: false, error: "OTP and transaction ID are required" },
        { status: 400 }
      );
    }

    const payload = {
      otp: String(otp).trim(),
      transactionId: String(transactionId).trim(),
      device: "WEB",
      version: null,
    };

    const erpRes = await fetch("https://kiet.cybervidya.net/api/auth/verify/otp", {
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
      const errMsg = data.error?.reason || data.message || "Invalid OTP. Please try again.";
      return NextResponse.json({ success: false, error: errMsg }, { status: erpRes.status });
    }

    const tokenData = data.data;
    if (!tokenData?.token) {
      return NextResponse.json(
        { success: false, error: "Token not returned by server" },
        { status: 500 }
      );
    }

    // Return the token to client browser (zero server-side retention)
    return NextResponse.json({
      success: true,
      token: tokenData.token,
      authPrefix: tokenData.auth_pref || "GlobalEducation ",
      studentId: tokenData.id,
      message: "Authentication successful",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
