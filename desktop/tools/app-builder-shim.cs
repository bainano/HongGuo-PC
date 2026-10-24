using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

// app-builder 包装器：修复 app-builder-bin 5.0.0-alpha.10 的 rcedit 缺陷
// （Go 中间层占用目标 exe 句柄导致 rcedit EndUpdateResourceW 失败：
//   "Fatal error: Unable to commit changes"）。
// 用法：由 electron-builder 通过 CUSTOM_APP_BUILDER_PATH 环境变量指向本程序。
//   - 子命令为 rcedit 时：解析 --args JSON 数组，直接调用 rcedit-x64.exe（不占用文件句柄）
//   - 其他子命令：原样转发给真正的 app-builder.exe，退出码与输出透传
public static class Shim
{
    // 真正的 app-builder.exe 需放在 node_modules/工作区之外运行：
    // 本机安全软件（360 等）会拦截工作区内进程的文件写入（mkdir/创建文件均拒绝访问）
    const string RealAppBuilder = @"C:\hg-build-tools\bin\app-builder.exe";

    public static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
            if (args.Length >= 3 && args[0] == "rcedit" && args[1] == "--args")
            {
                return RunRcedit(args[2]);
            }
            return Forward(args);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("[app-builder-shim] error: " + e.Message);
            return 1;
        }
    }

    static int RunRcedit(string json)
    {
        List<string> rceditArgs = ParseJsonStringArray(json);
        if (rceditArgs.Count == 0)
        {
            Console.Error.WriteLine("[app-builder-shim] empty rcedit args");
            return 1;
        }
        string rcedit = FindRcedit();
        if (rcedit == null)
        {
            Console.Error.WriteLine("[app-builder-shim] rcedit-x64.exe not found in winCodeSign cache");
            return 1;
        }
        var psi = new ProcessStartInfo(rcedit, BuildCommandLine(rceditArgs))
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        var p = Process.Start(psi);
        string so = p.StandardOutput.ReadToEnd();
        string se = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (!string.IsNullOrEmpty(so)) Console.Out.Write(so);
        if (!string.IsNullOrEmpty(se)) Console.Error.Write(se);
        return p.ExitCode;
    }

    static string FindRcedit()
    {
        var roots = new List<string>();
        string cache = Environment.GetEnvironmentVariable("ELECTRON_BUILDER_CACHE");
        if (!string.IsNullOrEmpty(cache)) roots.Add(Path.Combine(cache, "winCodeSign"));
        roots.Add(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "electron-builder", "Cache", "winCodeSign"));
        string best = null;
        foreach (string root in roots)
        {
            if (!Directory.Exists(root)) continue;
            foreach (string dir in Directory.GetDirectories(root, "winCodeSign-*"))
            {
                string exe = Path.Combine(dir, "rcedit-x64.exe");
                if (!File.Exists(exe)) continue;
                if (best == null || string.CompareOrdinal(Path.GetFileName(dir), Path.GetFileName(best)) > 0)
                    best = exe;
            }
        }
        return best;
    }

    static int Forward(string[] args)
    {
        if (!File.Exists(RealAppBuilder))
        {
            Console.Error.WriteLine("[app-builder-shim] real app-builder not found: " + RealAppBuilder);
            return 1;
        }
        var psi = new ProcessStartInfo(RealAppBuilder, BuildCommandLine(args))
        {
            UseShellExecute = false
        };
        var p = Process.Start(psi);
        p.WaitForExit();
        return p.ExitCode;
    }

    // Windows CreateProcess 命令行参数引用规则（CommandLineToArgvW）
    static string BuildCommandLine(IEnumerable<string> args)
    {
        var sb = new StringBuilder();
        foreach (string a in args)
        {
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(QuoteArg(a));
        }
        return sb.ToString();
    }

    static string QuoteArg(string a)
    {
        if (string.IsNullOrEmpty(a)) return "\"\"";
        if (!a.Any(c => c == ' ' || c == '\t' || c == '"')) return a;
        return "\"" + a.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    // 解析 JSON.stringify 产出的字符串数组（无外部依赖）
    static List<string> ParseJsonStringArray(string s)
    {
        var list = new List<string>();
        int i = 0;
        SkipWs(s, ref i);
        if (i >= s.Length || s[i] != '[') throw new Exception("expected '['");
        i++;
        SkipWs(s, ref i);
        if (i < s.Length && s[i] == ']') return list;
        while (true)
        {
            SkipWs(s, ref i);
            if (i >= s.Length || s[i] != '"') throw new Exception("expected string");
            i++;
            var sb = new StringBuilder();
            while (i < s.Length && s[i] != '"')
            {
                char c = s[i++];
                if (c == '\\')
                {
                    if (i >= s.Length) break;
                    char e = s[i++];
                    switch (e)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'u':
                            sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                        default: sb.Append(e); break;
                    }
                }
                else sb.Append(c);
            }
            i++; // closing quote
            list.Add(sb.ToString());
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ',') { i++; continue; }
            if (i < s.Length && s[i] == ']') break;
            throw new Exception("malformed JSON array");
        }
        return list;
    }

    static void SkipWs(string s, ref int i)
    {
        while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
    }
}
