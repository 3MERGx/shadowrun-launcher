using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace XLiveActivateHelper
{
    internal class Crypt32
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct DATA_BLOB
        {
            public int cbData;
            public IntPtr pbData;
        }

        [DllImport("kernel32.dll")]
        static extern IntPtr LocalFree(IntPtr hMem);

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CryptProtectData(ref DATA_BLOB pDataIn, string szDataDescr, IntPtr pOptionalEntropy, IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, ref DATA_BLOB pDataOut);

        public static byte[] Encrypt(byte[] data)
        {
            DATA_BLOB inBlob = new DATA_BLOB();
            DATA_BLOB outBlob = new DATA_BLOB();
            inBlob.cbData = data.Length;
            inBlob.pbData = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, inBlob.pbData, data.Length);

            bool EncryptionStatus = CryptProtectData(ref inBlob, "xlive.dll", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref outBlob);
            Marshal.FreeHGlobal(inBlob.pbData);

            if (!EncryptionStatus)
                throw new Win32Exception(Marshal.GetLastWin32Error());

            byte[] encrypted = new byte[outBlob.cbData];
            Marshal.Copy(outBlob.pbData, encrypted, 0, outBlob.cbData);
            LocalFree(outBlob.pbData);

            return encrypted;
        }
    }
}