import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);

export const maxDuration = 300; // Allow 5 minutes for rendering

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const timestamps = formData.get('timestamps') as string;
    const width = formData.get('width') as string || '1920';
    const height = formData.get('height') as string || '1080';
    const fontName = formData.get('font') as string || 'DevanagariMT';

    if (!audioFile || !timestamps) {
      return NextResponse.json({ error: 'Missing audio or timestamps' }, { status: 400 });
    }

    // 1. Save Audio
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    // We save to the PARENT directory where the python script lives, or a temp folder.
    // Ideally we save to the 'Disclaimer' root so the python script can find it easily.
    // Since this is running locally, we know the path structure.
    // process.cwd() is manual-sync-studio root.
    // Python script is in ../make_disclaimer_video.py
    
    const projectRoot = path.resolve(process.cwd(), '..');
    const tempAudioPath = path.join(projectRoot, 'temp_upload_audio.m4a');
    const tempJsonPath = path.join(projectRoot, 'temp_upload_timestamps.json');
    const outputVideoPath = path.join(process.cwd(), 'public', 'generated_video.mp4');

    await writeFileAsync(tempAudioPath, audioBuffer);
    await writeFileAsync(tempJsonPath, timestamps);

    // 2. Run Python Script
    // We need to use the venv python.
    const venvPython = path.join(projectRoot, 'venv/bin/python');
    const scriptPath = path.join(projectRoot, 'make_disclaimer_video.py');

    const command = `"${venvPython}" "${scriptPath}" --audio "${tempAudioPath}" --json "${tempJsonPath}" --output "${outputVideoPath}" --width ${width} --height ${height} --font "${fontName}"`;
    
    console.log("Executing:", command);

    const { stdout, stderr } = await execAsync(command);
    console.log("Stdout:", stdout);
    if (stderr) console.error("Stderr:", stderr);

    // 3. Return Success
    // The file is now in public/generated_video.mp4
    return NextResponse.json({ 
      success: true, 
      videoUrl: '/generated_video.mp4?t=' + Date.now() // Cache busting
    });

  } catch (error: any) {
    console.error("Render error:", error);
    return NextResponse.json({ error: error.message || 'Render failed' }, { status: 500 });
  }
}
