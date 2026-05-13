import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "../../../lib/db";

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid credentials",
        },
        {
          status: 401,
        }
      );
    }

    const isValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid credentials",
        },
        {
          status: 401,
        }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Login failed",
      },
      {
        status: 500,
      }
    );
  }
}
