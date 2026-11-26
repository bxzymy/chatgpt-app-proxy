using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;

internal static class CreateIcon
{
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);

    [STAThread]
    private static void Main(string[] arguments)
    {
        using (var bitmap = new Bitmap(64, 64))
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.Clear(Color.Transparent);
            using (var shape = new GraphicsPath())
            {
                shape.AddArc(2, 2, 20, 20, 180, 90);
                shape.AddArc(42, 2, 20, 20, 270, 90);
                shape.AddArc(42, 42, 20, 20, 0, 90);
                shape.AddArc(2, 42, 20, 20, 90, 90);
                shape.CloseFigure();
                using (var fill = new LinearGradientBrush(new Rectangle(0, 0, 64, 64), Color.FromArgb(48, 120, 217), Color.FromArgb(23, 73, 151), 90F))
                    graphics.FillPath(fill, shape);
            }
            using (var pen = new Pen(Color.White, 4F))
            {
                graphics.DrawLine(pen, 19, 19, 45, 32);
                graphics.DrawLine(pen, 45, 32, 19, 45);
                graphics.DrawLine(pen, 19, 19, 19, 45);
            }
            foreach (var point in new[] { new Point(19, 19), new Point(45, 32), new Point(19, 45) })
                graphics.FillEllipse(Brushes.White, point.X - 6, point.Y - 6, 12, 12);
            IntPtr handle = bitmap.GetHicon();
            try
            {
                using (var icon = Icon.FromHandle(handle))
                using (var stream = File.Create(arguments[0])) icon.Save(stream);
            }
            finally { DestroyIcon(handle); }
        }
    }
}
