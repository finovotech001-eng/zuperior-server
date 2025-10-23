// zuperior-dashboard/client/src/app/api/mt5/groups/route.ts (New File)

import { NextResponse } from 'next/server';

const ALLOWED_GROUPS = [
  "real\\Bbook\\Pro\\dynamic-2000x-10P",
  "real\\Bbook\\Standard\\dynamic-2000x-20Pips",
];

export async function GET(request: Request) {
  try {
    // --- 1. Call your Express Backend API ---
    // Assuming your Express server is running on NEXT_PUBLIC_BACKEND_API_URL
    const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

    // We are proxying to the Express endpoint: GET /api/mt5/groups
    const response = await fetch(`${backendApiUrl}/mt5/groups`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        // Forward non-OK responses (e.g., 500 from Express)
        const errorData = await response.json();
        return NextResponse.json({ message: errorData.message || 'Internal MT5 groups error' }, { status: response.status });
    }

    const allGroups = await response.json();

    // --- 2. Filter Logic (as requested in documentation) ---
    const filteredGroups = allGroups.filter((group: any) =>
      ALLOWED_GROUPS.includes(group.Group)
    );

    // --- 3. Return Filtered Response ---
    return NextResponse.json(filteredGroups, { status: 200 });

  } catch (error) {
    console.error('Error fetching/filtering MT5 groups:', error);
    return NextResponse.json(
      { message: 'Failed to fetch MT5 groups due to server error.' },
      { status: 500 }
    );
  }
}

// NOTE: You must also create the corresponding Express Controller and Route
// for /api/mt5/groups to use the mt5.service.js function!