/*
---------------------------------------------------------------------
--- MaterialHud    : Heads-up display for the Markerless AR demos.
--- Design system  : Material Design 3, dark colour scheme
---                  (https://m3.material.io).
--- OpenCV Version : 2.4.x and 3.x / 4.x
---------------------------------------------------------------------

This header-only module has three layers:

  1. Design tokens  (hud::tokens)  - colour roles, type scale, shape
                                     scale, spacing scale and opacity.
  2. Components     (hud::Painter) - card, chip, switch, slider,
                                     keycap and text primitives.
  3. Screen layout  (hud::drawOverlay) - the AR control panel, the
                                     status chip, the FPS chip and the
                                     keyboard hint bar.

Components read only tokens. Do not put raw colours or pixel sizes in
the components or in the layout. Change the look in one place: the
tokens.

All sizes are in "dp" (density-independent pixels). One dp is one pixel
on a 480 px high frame. The painter scales dp to the real frame height.
*/

#ifndef MATERIAL_HUD_HPP
#define MATERIAL_HUD_HPP

#include <opencv2/opencv.hpp>

#include <algorithm>
#include <cstdio>
#include <string>

namespace hud
{

// ---------------------------------------------------------------------
// OpenCV 2.4 / 3+ compatibility
// ---------------------------------------------------------------------
#if CV_MAJOR_VERSION >= 3
    const int kLineAA = cv::LINE_AA;
#else
    const int kLineAA = CV_AA;
#endif

// ---------------------------------------------------------------------
// 1. Design tokens
// ---------------------------------------------------------------------

//! Converts a "#RRGGBB" hex value to an OpenCV BGR scalar.
inline cv::Scalar hex(unsigned int rgb)
{
    return cv::Scalar(rgb & 0xFF, (rgb >> 8) & 0xFF, (rgb >> 16) & 0xFF);
}

namespace tokens
{
    // Colour roles: Material Design 3 baseline, dark scheme.
    namespace color
    {
        inline cv::Scalar primary()                 { return hex(0xD0BCFF); }
        inline cv::Scalar onPrimary()               { return hex(0x381E72); }
        inline cv::Scalar primaryContainer()        { return hex(0x4F378B); }
        inline cv::Scalar onPrimaryContainer()      { return hex(0xEADDFF); }
        inline cv::Scalar secondaryContainer()      { return hex(0x4A4458); }

        inline cv::Scalar surfaceContainer()        { return hex(0x211F26); }
        inline cv::Scalar surfaceContainerHigh()    { return hex(0x2B2930); }
        inline cv::Scalar surfaceContainerHighest() { return hex(0x36343B); }
        inline cv::Scalar onSurface()               { return hex(0xE6E0E9); }
        inline cv::Scalar onSurfaceVariant()        { return hex(0xCAC4D0); }
        inline cv::Scalar outline()                 { return hex(0x938F99); }
        inline cv::Scalar outlineVariant()          { return hex(0x49454F); }

        // Extended (custom) colour roles for the tracking status.
        inline cv::Scalar success()                 { return hex(0x8DD88A); }
        inline cv::Scalar successContainer()        { return hex(0x1E4D22); }
        inline cv::Scalar onSuccessContainer()      { return hex(0xA8F5A3); }
        inline cv::Scalar warning()                 { return hex(0xF5C062); }
        inline cv::Scalar warningContainer()        { return hex(0x5C4300); }
        inline cv::Scalar onWarningContainer()      { return hex(0xFFDEA6); }
    }

    // Type scale. The size is the M3 line height in dp.
    // The weight is the stroke thickness of the Hershey font.
    struct TypeStyle { float size; int weight; };
    namespace type
    {
        inline TypeStyle titleMedium() { TypeStyle t = { 16.0f, 2 }; return t; }
        inline TypeStyle labelLarge()  { TypeStyle t = { 14.0f, 1 }; return t; }
        inline TypeStyle bodyMedium()  { TypeStyle t = { 14.0f, 1 }; return t; }
        inline TypeStyle labelSmall()  { TypeStyle t = { 11.0f, 1 }; return t; }
    }

    // Shape scale (corner radius, dp).
    namespace shape
    {
        const float extraSmall = 4.0f;
        const float small      = 8.0f;
        const float medium     = 12.0f;
        const float large      = 16.0f;
        const float full       = 1000.0f;   // clamped to half the height
    }

    // Spacing scale (dp), 4 dp grid.
    namespace space
    {
        const float xs  = 4.0f;
        const float sm  = 8.0f;
        const float md  = 12.0f;
        const float lg  = 16.0f;
        const float xl  = 24.0f;
    }

    // Opacity of translucent surfaces over the camera image.
    namespace opacity
    {
        const double surface = 0.82;
        const double chip    = 0.90;
    }
}

// ---------------------------------------------------------------------
// 2. Components
// ---------------------------------------------------------------------

class Painter
{
public:
    explicit Painter(cv::Mat& canvas)
        : m_canvas(canvas)
    {
        // 1 dp = 1 px on a 480 px high frame. Keep small frames legible.
        m_scale = (std::max)(0.75f, canvas.rows / 480.0f);
    }

    //! Converts dp to pixels.
    int dp(float value) const { return cvRound(value * m_scale); }

    //! Returns the width in pixels of a text in a type style.
    int textWidth(const std::string& text, const tokens::TypeStyle& style) const
    {
        int baseline = 0;
        return cv::getTextSize(text, font(), fontScale(style), style.weight, &baseline).width;
    }

    //! Draws a text. The text is centred vertically in [top, top + height).
    void text(const std::string& value, int x, int top, int height,
              const tokens::TypeStyle& style, const cv::Scalar& color)
    {
        int baseline = 0;
        cv::Size size = cv::getTextSize(value, font(), fontScale(style), style.weight, &baseline);
        int y = top + (height + size.height) / 2;
        cv::putText(m_canvas, value, cv::Point(x, y), font(), fontScale(style),
                    color, style.weight, kLineAA);
    }

    //! Fills a rounded rectangle. The alpha value is the surface opacity.
    void roundedRect(const cv::Rect& rect, float radiusDp, const cv::Scalar& color, double alpha)
    {
        cv::Rect clipped = rect & cv::Rect(0, 0, m_canvas.cols, m_canvas.rows);
        if (clipped.area() <= 0)
            return;

        int r = (std::min)(dp(radiusDp), (std::min)(rect.width, rect.height) / 2);

        if (alpha >= 1.0)
        {
            fillRounded(m_canvas, rect, r, color);
            return;
        }

        // Paint on a copy of the region, then blend the copy back.
        // Pixels outside the shape blend with themselves and do not change.
        cv::Mat roi = m_canvas(clipped);
        cv::Mat layer = roi.clone();
        cv::Rect local(rect.x - clipped.x, rect.y - clipped.y, rect.width, rect.height);
        fillRounded(layer, local, r, color);
        cv::addWeighted(layer, alpha, roi, 1.0 - alpha, 0.0, roi);
    }

    //! Draws the outline of a rounded rectangle.
    void roundedOutline(const cv::Rect& rect, float radiusDp, const cv::Scalar& color, int thickness)
    {
        int r = (std::min)(dp(radiusDp), (std::min)(rect.width, rect.height) / 2);
        int x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.width - 1, y1 = rect.y + rect.height - 1;

        cv::line(m_canvas, cv::Point(x0 + r, y0), cv::Point(x1 - r, y0), color, thickness, kLineAA);
        cv::line(m_canvas, cv::Point(x0 + r, y1), cv::Point(x1 - r, y1), color, thickness, kLineAA);
        cv::line(m_canvas, cv::Point(x0, y0 + r), cv::Point(x0, y1 - r), color, thickness, kLineAA);
        cv::line(m_canvas, cv::Point(x1, y0 + r), cv::Point(x1, y1 - r), color, thickness, kLineAA);
        cv::ellipse(m_canvas, cv::Point(x0 + r, y0 + r), cv::Size(r, r), 180, 0, 90, color, thickness, kLineAA);
        cv::ellipse(m_canvas, cv::Point(x1 - r, y0 + r), cv::Size(r, r), 270, 0, 90, color, thickness, kLineAA);
        cv::ellipse(m_canvas, cv::Point(x1 - r, y1 - r), cv::Size(r, r),   0, 0, 90, color, thickness, kLineAA);
        cv::ellipse(m_canvas, cv::Point(x0 + r, y1 - r), cv::Size(r, r),  90, 0, 90, color, thickness, kLineAA);
    }

    //! Card: translucent container surface (M3 "filled card").
    void card(const cv::Rect& rect)
    {
        roundedRect(rect, tokens::shape::large, tokens::color::surfaceContainer(), tokens::opacity::surface);
        roundedOutline(rect, tokens::shape::large, tokens::color::outlineVariant(), 1);
    }

    //! Status chip with a leading dot. Returns the chip width in pixels.
    //! The chip is right-aligned at "right" when alignRight is true.
    int statusChip(int x, int top, const std::string& label,
                   const cv::Scalar& container, const cv::Scalar& onContainer,
                   const cv::Scalar& dot, bool alignRight)
    {
        tokens::TypeStyle style = tokens::type::labelSmall();
        int height  = dp(24);
        int dotR    = dp(3.5f);
        int padding = dp(tokens::space::md);
        int gap     = dp(tokens::space::sm);
        int width   = padding + 2 * dotR + gap + textWidth(label, style) + padding;
        int left    = alignRight ? x - width : x;

        cv::Rect rect(left, top, width, height);
        roundedRect(rect, tokens::shape::full, container, tokens::opacity::chip);
        cv::circle(m_canvas, cv::Point(left + padding + dotR, top + height / 2), dotR, dot, -1, kLineAA);
        text(label, left + padding + 2 * dotR + gap, top, height, style, onContainer);
        return width;
    }

    //! Switch (M3 switch, compact). Right edge at "right".
    void toggle(int right, int top, int height, bool on)
    {
        int trackH = dp(24);
        int trackW = dp(40);
        cv::Rect track(right - trackW, top + (height - trackH) / 2, trackW, trackH);

        if (on)
        {
            roundedRect(track, tokens::shape::full, tokens::color::primary(), 1.0);
            int r = dp(8);
            cv::Point c(track.x + trackW - trackH / 2, track.y + trackH / 2);
            cv::circle(m_canvas, c, r, tokens::color::onPrimary(), -1, kLineAA);
        }
        else
        {
            roundedRect(track, tokens::shape::full, tokens::color::surfaceContainerHighest(), 1.0);
            roundedOutline(track, tokens::shape::full, tokens::color::outline(), (std::max)(1, dp(1.5f)));
            int r = dp(5);
            cv::Point c(track.x + trackH / 2, track.y + trackH / 2);
            cv::circle(m_canvas, c, r, tokens::color::outline(), -1, kLineAA);
        }
    }

    //! Slider (M3 slider, display only). "fraction" is in [0, 1].
    void slider(int left, int right, int centerY, float fraction)
    {
        fraction = (std::max)(0.0f, (std::min)(1.0f, fraction));
        int trackH  = dp(4);
        int handleW = dp(4);
        int handleH = dp(20);
        int gap     = dp(4);
        int handleX = left + cvRound((right - left - handleW) * fraction);

        cv::Rect active(left, centerY - trackH / 2, (std::max)(0, handleX - gap - left), trackH);
        cv::Rect inactive(handleX + handleW + gap, centerY - trackH / 2,
                          (std::max)(0, right - (handleX + handleW + gap)), trackH);
        cv::Rect handle(handleX, centerY - handleH / 2, handleW, handleH);

        if (active.width > 0)
            roundedRect(active, tokens::shape::full, tokens::color::primary(), 1.0);
        if (inactive.width > 0)
            roundedRect(inactive, tokens::shape::full, tokens::color::secondaryContainer(), 1.0);
        roundedRect(handle, tokens::shape::full, tokens::color::primary(), 1.0);
    }

    //! Keycap that shows a keyboard key. Returns the width in pixels.
    int keycap(int left, int top, const std::string& key)
    {
        tokens::TypeStyle style = tokens::type::labelSmall();
        int height = dp(20);
        int width  = (std::max)(height, textWidth(key, style) + dp(tokens::space::sm) * 2);
        cv::Rect rect(left, top, width, height);
        roundedRect(rect, tokens::shape::extraSmall, tokens::color::surfaceContainerHighest(), 1.0);
        roundedOutline(rect, tokens::shape::extraSmall, tokens::color::outline(), 1);
        int tw = textWidth(key, style);
        text(key, left + (width - tw) / 2, top, height, style, tokens::color::onSurface());
        return width;
    }

    cv::Mat& canvas() { return m_canvas; }

private:
    static int font() { return cv::FONT_HERSHEY_SIMPLEX; }

    double fontScale(const tokens::TypeStyle& style) const
    {
        // A Hershey Simplex cap is about 22 px high at scale 1.0.
        // Cap height is about 50 % of the M3 line height.
        return style.size * 0.5 * m_scale / 22.0 * 1.45;
    }

    static void fillRounded(cv::Mat& img, const cv::Rect& rect, int r, const cv::Scalar& color)
    {
        int x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.width - 1, y1 = rect.y + rect.height - 1;
        if (r <= 0)
        {
            cv::rectangle(img, rect, color, -1);
            return;
        }
        cv::rectangle(img, cv::Point(x0 + r, y0), cv::Point(x1 - r, y1), color, -1);
        cv::rectangle(img, cv::Point(x0, y0 + r), cv::Point(x1, y1 - r), color, -1);
        cv::circle(img, cv::Point(x0 + r, y0 + r), r, color, -1, kLineAA);
        cv::circle(img, cv::Point(x1 - r, y0 + r), r, color, -1, kLineAA);
        cv::circle(img, cv::Point(x0 + r, y1 - r), r, color, -1, kLineAA);
        cv::circle(img, cv::Point(x1 - r, y1 - r), r, color, -1, kLineAA);
    }

    cv::Mat& m_canvas;
    float    m_scale;
};

// ---------------------------------------------------------------------
// Frame-rate counter (exponential moving average)
// ---------------------------------------------------------------------
class FpsCounter
{
public:
    FpsCounter() : m_last(0), m_fps(0.0) {}

    //! Call one time per frame. Returns the smoothed frames per second.
    double tick()
    {
        int64 now = cv::getTickCount();
        if (m_last != 0)
        {
            double dt = (now - m_last) / cv::getTickFrequency();
            if (dt > 0.0)
            {
                double fps = 1.0 / dt;
                m_fps = (m_fps == 0.0) ? fps : 0.9 * m_fps + 0.1 * fps;
            }
        }
        m_last = now;
        return m_fps;
    }

private:
    int64  m_last;
    double m_fps;
};

// ---------------------------------------------------------------------
// 3. Screen layout
// ---------------------------------------------------------------------

//! The values the overlay shows.
struct OverlayState
{
    std::string title;              //!< Panel heading
    bool        patternFound;       //!< True when the pattern is tracked
    bool        poseRefinement;     //!< Homography refinement on/off
    float       ransacThreshold;    //!< Reprojection threshold (px)
    float       ransacThresholdMax; //!< Upper limit of the threshold
    double      fps;                //!< Frames per second, 0 hides the chip
};

inline std::string formatFixed(double value, int decimals)
{
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "%.*f", decimals, value);
    return buffer;
}

//! Draws the full heads-up display on the frame.
inline void drawOverlay(cv::Mat& frame, const OverlayState& state)
{
    using namespace tokens;
    Painter p(frame);

    const int margin  = p.dp(space::lg);
    const int padding = p.dp(space::lg);

    // --- Control panel card (top left) --------------------------------
    const int panelW = (std::min)(p.dp(288), frame.cols - 2 * margin);
    const int rowH   = p.dp(28);
    const int innerL = margin + padding;
    const int innerR = margin + panelW - padding;

    int y = margin + padding;
    const int headerTop = y;
    y += rowH + p.dp(space::md);
    const int switchTop = y;
    y += rowH + p.dp(space::sm);
    const int sliderTop = y;
    y += rowH + p.dp(space::lg);
    const int panelH = y + padding - p.dp(space::sm) - margin;

    p.card(cv::Rect(margin, margin, panelW, panelH));

    // Header: title and tracking status.
    p.text(state.title, innerL, headerTop, rowH, type::titleMedium(), color::onSurface());
    int chipTop = headerTop + (rowH - p.dp(24)) / 2;
    if (state.patternFound)
        p.statusChip(innerR, chipTop, "TRACKING", color::successContainer(),
                     color::onSuccessContainer(), color::success(), true);
    else
        p.statusChip(innerR, chipTop, "SEARCHING", color::warningContainer(),
                     color::onWarningContainer(), color::warning(), true);

    // Divider between header and controls.
    int dividerY = switchTop - p.dp(space::md) / 2;
    cv::line(frame, cv::Point(innerL, dividerY), cv::Point(innerR, dividerY),
             color::outlineVariant(), 1, kLineAA);

    // Row: pose refinement switch.
    p.text("Pose refinement", innerL, switchTop, rowH, type::bodyMedium(), color::onSurface());
    p.toggle(innerR, switchTop, rowH, state.poseRefinement);

    // Row: RANSAC threshold slider.
    std::string value = formatFixed(state.ransacThreshold, 1) + " px";
    p.text("RANSAC threshold", innerL, sliderTop, rowH, type::bodyMedium(), color::onSurface());
    p.text(value, innerR - p.textWidth(value, type::labelLarge()), sliderTop, rowH,
           type::labelLarge(), color::primary());
    float fraction = state.ransacThresholdMax > 0.0f ? state.ransacThreshold / state.ransacThresholdMax : 0.0f;
    p.slider(innerL, innerR, sliderTop + rowH + p.dp(space::xs), fraction);

    // --- FPS chip (top right) -----------------------------------------
    if (state.fps > 0.0)
    {
        p.statusChip(frame.cols - margin, margin, formatFixed(state.fps, 0) + " FPS",
                     color::surfaceContainerHigh(), color::onSurfaceVariant(),
                     color::primary(), true);
    }

    // --- Keyboard hint bar (bottom centre) ----------------------------
    struct Hint { const char* keys[2]; const char* label; };
    const Hint hints[] = {
        { { "H", 0 },   "Refinement" },
        { { "-", "+" }, "Threshold"  },
        { { "Q", 0 },   "Quit"       },
    };
    const int hintCount = sizeof(hints) / sizeof(hints[0]);
    const TypeStyle labelStyle = type::labelLarge();
    const int barH   = p.dp(36);
    const int keyGap = p.dp(space::xs);
    const int sepGap = p.dp(space::xl);

    // Measure the bar so that it can be centred.
    int contentW = 0;
    for (int i = 0; i < hintCount; ++i)
    {
        for (int k = 0; k < 2 && hints[i].keys[k]; ++k)
        {
            int kw = (std::max)(p.dp(20), p.textWidth(hints[i].keys[k], type::labelSmall()) + p.dp(space::sm) * 2);
            contentW += kw + keyGap;
        }
        contentW += p.dp(space::xs) + p.textWidth(hints[i].label, labelStyle);
        if (i + 1 < hintCount)
            contentW += sepGap;
    }

    int barW = contentW + 2 * p.dp(space::lg);
    int barX = (frame.cols - barW) / 2;
    int barY = frame.rows - margin - barH;
    if (barW <= frame.cols - 2 * margin && barY > margin + panelH)
    {
        p.roundedRect(cv::Rect(barX, barY, barW, barH), shape::full,
                      color::surfaceContainer(), opacity::surface);

        int x = barX + p.dp(space::lg);
        int keyTop = barY + (barH - p.dp(20)) / 2;
        for (int i = 0; i < hintCount; ++i)
        {
            for (int k = 0; k < 2 && hints[i].keys[k]; ++k)
                x += p.keycap(x, keyTop, hints[i].keys[k]) + keyGap;
            x += p.dp(space::xs);
            p.text(hints[i].label, x, barY, barH, labelStyle, color::onSurfaceVariant());
            x += p.textWidth(hints[i].label, labelStyle) + sepGap;
        }
    }
}

} // namespace hud

#endif
