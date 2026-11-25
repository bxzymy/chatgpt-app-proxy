/* Code-native vector icon, rendered with AppKit. No downloaded assets. */
ObjC.import('Cocoa');
function run(argv) {
    var directory = argv[0];
    if (!directory || directory.charAt(0) !== '/') { throw new Error('An absolute iconset directory is required'); }
    $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(directory, true, $({}), null);
    [16, 32, 128, 256, 512].forEach(function (size) {
        [1, 2].forEach(function (scale) {
            var pixels = size * scale;
            var image = $.NSImage.alloc.initWithSize($.NSMakeSize(pixels, pixels));
            image.lockFocus;
            var background = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(pixels * 0.06, pixels * 0.06, pixels * 0.88, pixels * 0.88), pixels * 0.20, pixels * 0.20);
            var gradient = $.NSGradient.alloc.initWithStartingColorEndingColor($.NSColor.colorWithSRGBRedGreenBlueAlpha(0.12, 0.36, 0.67, 1), $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.24, 0.57, 0.82, 1));
            gradient.drawInBezierPathAngle(background, 90);
            $.NSColor.whiteColor.setStroke;
            var line = $.NSBezierPath.bezierPath;
            line.lineWidth = pixels * 0.055;
            line.lineCapStyle = 1;
            line.moveToPoint($.NSMakePoint(pixels * 0.5, pixels * 0.65));
            line.lineToPoint($.NSMakePoint(pixels * 0.5, pixels * 0.47));
            line.moveToPoint($.NSMakePoint(pixels * 0.28, pixels * 0.35));
            line.lineToPoint($.NSMakePoint(pixels * 0.28, pixels * 0.47));
            line.lineToPoint($.NSMakePoint(pixels * 0.72, pixels * 0.47));
            line.lineToPoint($.NSMakePoint(pixels * 0.72, pixels * 0.35));
            line.stroke;
            $.NSColor.whiteColor.setFill;
            [[0.5, 0.68], [0.28, 0.30], [0.72, 0.30]].forEach(function (point) {
                var radius = pixels * 0.075;
                $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(point[0] * pixels - radius, point[1] * pixels - radius, radius * 2, radius * 2)).fill;
            });
            image.unlockFocus;
            var representation = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
            representation.size = $.NSMakeSize(size, size);
            representation.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(directory + '/icon_' + size + 'x' + size + (scale === 2 ? '@2x' : '') + '.png', true);
        });
    });
    return 'Iconset generated';
}
