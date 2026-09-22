import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "No valid image data provided" }, { status: 400 });
    }

    // Limit payload size to ~2MB (around 2.8M characters in base64)
    if (image.length > 2.8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image file exceeds maximum allowable size of 2MB" }, { status: 413 });
    }

    // Validate image format
    if (!image.startsWith("data:image/") && !image.startsWith("http://") && !image.startsWith("https://")) {
      return NextResponse.json({ error: "Invalid image format. Must be an image data URI or URL" }, { status: 400 });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn("Cloudinary credentials not configured");
      return NextResponse.json({ error: "Cloudinary credentials not configured in environment" }, { status: 500 });
    }

    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: "svs_billing_signatures",
      resource_type: "image",
    });

    return NextResponse.json({ url: uploadResponse.secure_url }, { status: 200 });
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    return NextResponse.json({ error: error?.message || "Failed to upload image" }, { status: 500 });
  }
}
