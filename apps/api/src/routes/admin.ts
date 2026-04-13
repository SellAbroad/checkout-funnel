import { Hono } from "hono";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const admin = new Hono();

admin.post("/update-merchants", async (c) => {
  try {
    const dashboardDir = path.resolve(__dirname, "../../../dashboard");

    const scriptPath = path.join(dashboardDir, "scripts/update-merchants-map.mjs");

    // Run the update script
    const { stdout, stderr } = await execPromise(
      `cd "${dashboardDir}" && node "${scriptPath}"`,
      {
        env: {
          ...process.env,
          PRODUCTION_DATABASE_URL: process.env.PRODUCTION_DATABASE_URL,
        },
      }
    );

    // Extract count from stdout
    const countMatch = stdout.match(/(\d+) merchants imported/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;

    console.log(`✓ Updated merchants map: ${stdout}`);

    return c.json({
      success: true,
      count,
      message: "Merchants map updated successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Failed to update merchants:", errorMessage);

    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500
    );
  }
});

export default admin;
