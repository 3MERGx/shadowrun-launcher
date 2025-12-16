#include <windows.h>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <iostream>
#include <string>
#include <vector>
#include <tlhelp32.h>

// Link against required libraries
#pragma comment(lib, "ole32.lib")

// Helper function to find process ID by executable name
DWORD FindProcessByName(const std::wstring& processName) {
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) {
        return 0;
    }

    PROCESSENTRY32W pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32W);

    if (Process32FirstW(hSnapshot, &pe32)) {
        do {
            if (_wcsicmp(pe32.szExeFile, processName.c_str()) == 0) {
                CloseHandle(hSnapshot);
                return pe32.th32ProcessID;
            }
        } while (Process32NextW(hSnapshot, &pe32));
    }

    CloseHandle(hSnapshot);
    return 0;
}

// Set volume for a specific process
bool SetProcessVolume(DWORD processId, float volumeLevel) {
    HRESULT hr = CoInitialize(NULL);
    if (FAILED(hr)) {
        std::cerr << "Failed to initialize COM library. Error: " << hr << std::endl;
        return false;
    }

    bool success = false;
    IMMDeviceEnumerator* pEnumerator = NULL;
    IMMDevice* pDevice = NULL;
    IAudioSessionManager2* pSessionManager = NULL;
    IAudioSessionEnumerator* pSessionEnumerator = NULL;

    // Create device enumerator
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, 
                         __uuidof(IMMDeviceEnumerator), (void**)&pEnumerator);
    if (FAILED(hr)) {
        std::cerr << "Failed to create device enumerator. Error: " << hr << std::endl;
        CoUninitialize();
        return false;
    }

    // Get default audio endpoint
    hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (FAILED(hr)) {
        std::cerr << "Failed to get default audio endpoint. Error: " << hr << std::endl;
        pEnumerator->Release();
        CoUninitialize();
        return false;
    }

    // Get session manager
    hr = pDevice->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, 
                          NULL, (void**)&pSessionManager);
    if (FAILED(hr)) {
        std::cerr << "Failed to activate session manager. Error: " << hr << std::endl;
        pDevice->Release();
        pEnumerator->Release();
        CoUninitialize();
        return false;
    }

    // Get session enumerator
    hr = pSessionManager->GetSessionEnumerator(&pSessionEnumerator);
    if (FAILED(hr)) {
        std::cerr << "Failed to get session enumerator. Error: " << hr << std::endl;
        pSessionManager->Release();
        pDevice->Release();
        pEnumerator->Release();
        CoUninitialize();
        return false;
    }

    int sessionCount;
    hr = pSessionEnumerator->GetCount(&sessionCount);
    if (SUCCEEDED(hr)) {
        std::wcout << L"Found " << sessionCount << L" audio sessions" << std::endl;
        
        for (int i = 0; i < sessionCount; i++) {
            IAudioSessionControl* pSessionControl = NULL;
            IAudioSessionControl2* pSessionControl2 = NULL;
            ISimpleAudioVolume* pVolume = NULL;

            hr = pSessionEnumerator->GetSession(i, &pSessionControl);
            if (FAILED(hr)) continue;

            hr = pSessionControl->QueryInterface(__uuidof(IAudioSessionControl2), 
                                                 (void**)&pSessionControl2);
            if (FAILED(hr)) {
                pSessionControl->Release();
                continue;
            }

            DWORD sessionProcessId;
            hr = pSessionControl2->GetProcessId(&sessionProcessId);
            if (SUCCEEDED(hr) && sessionProcessId == processId) {
                std::wcout << L"Found target process session (PID: " << processId << L")" << std::endl;
                
                // Get volume control interface
                hr = pSessionControl2->QueryInterface(__uuidof(ISimpleAudioVolume), 
                                                      (void**)&pVolume);
                if (SUCCEEDED(hr)) {
                    // Set the volume (0.0 to 1.0)
                    hr = pVolume->SetMasterVolume(volumeLevel, NULL);
                    if (SUCCEEDED(hr)) {
                        std::wcout << L"Successfully set volume to " << (volumeLevel * 100.0f) 
                                  << L"%" << std::endl;
                        success = true;
                    } else {
                        std::cerr << "Failed to set volume. Error: " << hr << std::endl;
                    }
                    pVolume->Release();
                }
            }

            pSessionControl2->Release();
            pSessionControl->Release();

            if (success) break;
        }
    }

    pSessionEnumerator->Release();
    pSessionManager->Release();
    pDevice->Release();
    pEnumerator->Release();
    CoUninitialize();

    return success;
}

int wmain(int argc, wchar_t* argv[]) {
    std::wcout << L"Audio Volume Helper started" << std::endl;

    if (argc < 2) {
        std::wcerr << L"Usage: audio-volume-helper.exe <process_name> [volume_percent]" << std::endl;
        std::wcerr << L"Example: audio-volume-helper.exe Shadowrun.exe 50" << std::endl;
        return 1;
    }

    std::wstring processName = argv[1];
    float volumePercent = 50.0f; // Default to 50%

    if (argc >= 3) {
        volumePercent = _wtof(argv[2]);
        if (volumePercent < 0.0f || volumePercent > 100.0f) {
            std::wcerr << L"Volume must be between 0 and 100" << std::endl;
            return 1;
        }
    }

    float volumeLevel = volumePercent / 100.0f;

    std::wcout << L"Looking for process: " << processName << std::endl;
    
    // Wait up to 10 seconds for the process to appear
    DWORD processId = 0;
    for (int i = 0; i < 20; i++) {
        processId = FindProcessByName(processName);
        if (processId != 0) {
            std::wcout << L"Found process ID: " << processId << std::endl;
            break;
        }
        Sleep(500); // Wait 500ms before retrying
    }

    if (processId == 0) {
        std::wcerr << L"Process not found: " << processName << std::endl;
        return 2;
    }

    // Try to set volume multiple times (audio session might not be ready immediately)
    bool success = false;
    for (int attempt = 0; attempt < 10; attempt++) {
        std::wcout << L"Attempt " << (attempt + 1) << L" to set volume..." << std::endl;
        success = SetProcessVolume(processId, volumeLevel);
        if (success) {
            break;
        }
        Sleep(1000); // Wait 1 second before retrying
    }

    if (!success) {
        std::wcerr << L"Failed to set volume after multiple attempts" << std::endl;
        return 3;
    }

    std::wcout << L"Audio volume helper finished successfully" << std::endl;
    return 0;
}

