#include <windows.h>
#include <stdio.h>
#include <string.h>

// Function signature for XLiveSetSponsorToken
// Based on GFWL SDK: HRESULT XLiveSetSponsorToken(const char* pszToken);
typedef HRESULT (WINAPI *XLiveSetSponsorTokenProc)(const char* pszToken);

int main(int argc, char* argv[])
{
    // Check for product key argument
    if (argc < 2)
    {
        fprintf(stderr, "Error: Product key argument required\n");
        return 1;
    }

    const char* productKey = argv[1];
    
    // Validate product key format (basic check)
    if (strlen(productKey) == 0)
    {
        fprintf(stderr, "Error: Empty product key\n");
        return 1;
    }

    // Load xlive.dll
    HMODULE hXLive = LoadLibraryA("xlive.dll");
    if (hXLive == NULL)
    {
        DWORD error = GetLastError();
        fprintf(stderr, "Error: Failed to load xlive.dll (Error code: %lu)\n", error);
        return 2;
    }

    // Get function address
    XLiveSetSponsorTokenProc pXLiveSetSponsorToken = 
        (XLiveSetSponsorTokenProc)GetProcAddress(hXLive, "XLiveSetSponsorToken");
    
    if (pXLiveSetSponsorToken == NULL)
    {
        DWORD error = GetLastError();
        fprintf(stderr, "Error: XLiveSetSponsorToken not found in xlive.dll (Error code: %lu)\n", error);
        FreeLibrary(hXLive);
        return 3;
    }

    // Call XLiveSetSponsorToken
    HRESULT hr = pXLiveSetSponsorToken(productKey);
    
    // Clean up
    FreeLibrary(hXLive);

    // Check result
    if (FAILED(hr))
    {
        fprintf(stderr, "Error: XLiveSetSponsorToken failed (HRESULT: 0x%08lX)\n", hr);
        return 4;
    }

    // Success
    return 0;
}

