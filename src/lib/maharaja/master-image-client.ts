/**
 * Asks for a Try-On look or an AI Video portrait. The server already moves through every image engine; a
 * failure it still returns (500, 502, 504) or a dropped connection is sent once more automatically, so a
 * passing problem never reaches the customer. Refusals (4xx) and "resting for today" (503) come back as they are.
 */
export async function fetchMasterImage(init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch('/api/ai/master-image', init);
      if (attempt >= 1 || ![500, 502, 504].includes(response.status)) return response;
    } catch (error) {
      if (attempt >= 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
