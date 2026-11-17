package dev.tml.mobilelauncher.feature.game.startup

import android.animation.ValueAnimator
import android.app.Dialog
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import dev.tml.mobilelauncher.R

/** Matching startup surface in the SDL process. All rows participate in normal layout. */
class GameStartupOverlay(context: Context, version: String, private val motion: Boolean) :
    FrameLayout(context) {
    private val density = resources.displayMetrics.density

    private fun dp(value: Int) = (value * density).toInt()

    private val compact = resources.configuration.screenHeightDp < 450
    private val ink = Color.rgb(230, 236, 223)
    private val muted = Color.rgb(124, 149, 149)
    private val green = Color.rgb(185, 215, 164)
    private val title = text("准备出发", if (compact) 20f else 24f, ink)
    private val subtitle = text("你的世界，即将继续。", 11f, muted)
    private val detail = text("正在准备 Android 运行环境…", 12f, Color.rgb(185, 198, 192))
    private val note = text("首次启动可能需要更长时间", 10f, muted)
    private val emblem = Emblem(context)
    private val steps = Steps(context)
    private val actions =
        LinearLayout(context).apply {
            gravity = Gravity.CENTER
            visibility = GONE
        }
    private val history = ArrayDeque<String>()
    private var failure = false
    private var presented = false
    private var logDialog: Dialog? = null
    private var returnAction: (() -> Unit)? = null
    private val canAnimate
        get() = motion && ValueAnimator.areAnimatorsEnabled()

    init {
        isClickable = true
        isFocusable = true
        background =
            GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(0xff131c23.toInt(), 0xff0c1419.toInt(), 0xff121c1b.toInt()),
            )
        val content =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(22), dp(10), dp(22), dp(8))
            }
        val top = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        top.addView(
            text("tModLoader  Mobile", 11f, muted),
            LinearLayout.LayoutParams(0, dp(28), 1f),
        )
        top.addView(text(version, 10f, muted))
        content.addView(top)
        val center =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, dp(12))
            }
        val emblemSize = dp(if (compact) 64 else 130)
        center.addView(emblem, LinearLayout.LayoutParams(emblemSize, emblemSize))
        center.addView(title, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        center.addView(subtitle, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4) })
        content.addView(center, LinearLayout.LayoutParams(-1, -2, 1f))
        val status =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(0, dp(6), 0, dp(8))
            }
        status.addView(
            steps,
            LinearLayout.LayoutParams(dp(127), dp(3)).apply { bottomMargin = dp(10) },
        )
        detail.maxLines = 2
        detail.ellipsize = TextUtils.TruncateAt.END
        detail.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        status.addView(detail, LinearLayout.LayoutParams(-1, -2))
        status.addView(note, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4) })
        content.addView(status)
        content.addView(
            actions,
            LinearLayout.LayoutParams(-1, -2).apply {
                topMargin = dp(4)
                bottomMargin = dp(4)
            },
        )
        val footer = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        footer.addView(text("•  本地启动", 10f, muted), LinearLayout.LayoutParams(0, dp(44), 1f))
        footer.addView(button("查看日志") { showLogs() }, LinearLayout.LayoutParams(-2, dp(44)))
        content.addView(footer)
        val scroll =
            ScrollView(context).apply {
                isFillViewport = true
                isVerticalScrollBarEnabled = false
                addView(content, LayoutParams(-1, -2))
            }
        addView(scroll, LayoutParams(-1, -1))
        setOnApplyWindowInsetsListener { _, insets ->
            val cutout = if (Build.VERSION.SDK_INT >= 28) insets.displayCutout else null
            setPadding(
                cutout?.safeInsetLeft ?: 0,
                cutout?.safeInsetTop ?: 0,
                cutout?.safeInsetRight ?: 0,
                cutout?.safeInsetBottom ?: 0,
            )
            insets
        }
    }

    fun update(titleText: String, message: String, percent: Int) {
        if (failure || presented) return
        if (history.lastOrNull() != message) {
            history.addLast(message.take(8000))
            if (history.size > 30) history.removeFirst()
        }
        title.text = if (titleText == "Startup failed") "暂时无法启动" else titleText.take(80)
        detail.text = message.take(1000)
        steps.stage = if (titleText.contains("进入") || titleText.contains("Loading")) 3 else 2
        note.text = if (percent in 0..99) "运行环境准备 $percent%" else "首次启动可能需要更长时间"
    }

    fun failed(message: String, returned: () -> Unit) {
        presented = false
        failure = true
        visibility = VISIBLE
        alpha = 1f
        animate().cancel()
        emblem.stop()
        returnAction = returned
        title.text = "暂时无法启动"
        subtitle.visibility = GONE
        detail.text = message.take(1000)
        note.text = "可查看日志了解原因"
        steps.visibility = GONE
        history.addLast(message.take(16000))
        actions.removeAllViews()
        actions.addView(
            button("返回启动器") { returned() }
                .apply {
                    setTextColor(0xff213627.toInt())
                    background =
                        GradientDrawable().apply {
                            setColor(green)
                            cornerRadius = dp(24).toFloat()
                        }
                },
            LinearLayout.LayoutParams(-2, dp(40)),
        )
        actions.visibility = VISIBLE
    }

    fun returnIfFailed(): Boolean {
        if (!failure) return false
        returnAction?.invoke()
        return true
    }

    fun firstFrame(onComplete: () -> Unit) {
        if (presented || failure) return
        presented = true
        logDialog?.dismiss()
        emblem.stop()
        animate()
            .alpha(0f)
            .setDuration(if (canAnimate) 250 else 0)
            .withEndAction {
                visibility = GONE
                onComplete()
            }
            .start()
    }

    fun resumeMotion() {
        if (!failure && !presented && canAnimate) emblem.start()
    }

    fun pauseMotion() {
        emblem.stop()
    }

    fun release() {
        emblem.stop()
        animate().cancel()
        logDialog?.dismiss()
        logDialog = null
    }

    private fun showLogs() {
        if (logDialog?.isShowing == true) return
        val panel =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(12), dp(20), dp(12))
                setBackgroundColor(0xff162225.toInt())
            }
        panel.addView(text("启动日志", 14f, ink))
        val body =
            text(history.joinToString("\n\n").ifBlank { detail.text.toString() }, 11f, muted)
                .apply {
                    gravity = Gravity.START
                    setTextIsSelectable(true)
                    setPadding(0, dp(12), 0, dp(12))
                }
        panel.addView(
            ScrollView(context).apply { addView(body) },
            LinearLayout.LayoutParams(-1, 0, 1f),
        )
        panel.addView(button("关闭日志") { logDialog?.dismiss() })
        logDialog =
            Dialog(context).apply {
                setContentView(panel)
                window?.setBackgroundDrawableResource(android.R.color.transparent)
                show()
                window?.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
                if (Build.VERSION.SDK_INT >= 30)
                    window?.insetsController?.hide(WindowInsets.Type.systemBars())
                window?.setLayout(
                    (resources.displayMetrics.widthPixels * .88f).toInt(),
                    (resources.displayMetrics.heightPixels * .7f).toInt(),
                )
            }
    }

    private fun text(value: String, size: Float, color: Int) =
        TextView(context).apply {
            text = value
            textSize = size
            setTextColor(color)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }

    private fun button(value: String, action: () -> Unit) =
        Button(context).apply {
            text = value
            textSize = 11f
            isAllCaps = false
            setTextColor(muted)
            background = null
            minHeight = dp(40)
            setPadding(dp(16), 0, dp(16), 0)
            setOnClickListener { action() }
        }

    private inner class Steps(context: Context) : View(context) {
        var stage = 2
            set(value) {
                field = value
                invalidate()
            }

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        override fun onDraw(canvas: Canvas) {
            for (index in 0..3) {
                val segment = (width - dp(15)) / 4f
                val left = index * (segment + dp(5))
                paint.color = if (index <= stage) green else 0xff263332.toInt()
                paint.alpha = if (index < stage) 180 else 255
                canvas.drawRoundRect(
                    left,
                    0f,
                    left + segment,
                    height.toFloat(),
                    height / 2f,
                    height / 2f,
                    paint,
                )
            }
        }
    }

    private inner class Emblem(context: Context) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val icon = context.getDrawable(R.drawable.tmodloader_icon)!!
        private var angle = 0f
        private var turn: ValueAnimator? = null

        fun start() {
            if (turn != null) return
            turn =
                ValueAnimator.ofFloat(angle, angle + 360f).apply {
                    duration = 4500
                    repeatCount = ValueAnimator.INFINITE
                    interpolator = LinearInterpolator()
                    addUpdateListener {
                        angle = it.animatedValue as Float
                        invalidate()
                    }
                    start()
                }
        }

        fun stop() {
            turn?.cancel()
            turn = null
        }

        override fun onDraw(canvas: Canvas) {
            val cx = width / 2f
            val cy = height / 2f
            val radius = minOf(cx, cy) - density
            paint.style = Paint.Style.FILL
            paint.color = 0xff1a2629.toInt()
            canvas.drawCircle(cx, cy, radius * .72f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = density
            paint.color = 0xff2b3b38.toInt()
            canvas.drawCircle(cx, cy, radius * .72f, paint)
            paint.color = 0xff293834.toInt()
            canvas.drawCircle(cx, cy, radius, paint)
            paint.color = 0xffa2ba8e.toInt()
            canvas.drawArc(
                RectF(cx - radius, cy - radius, cx + radius, cy + radius),
                angle - 90f,
                65f,
                false,
                paint,
            )
            paint.color = 0xff536857.toInt()
            val inner = radius * .88f
            canvas.drawArc(
                RectF(cx - inner, cy - inner, cx + inner, cy + inner),
                -angle / 2f + 90f,
                100f,
                false,
                paint,
            )
            val half = radius * .5f
            icon.setBounds(
                (cx - half).toInt(),
                (cy - half).toInt(),
                (cx + half).toInt(),
                (cy + half).toInt(),
            )
            icon.draw(canvas)
        }

        override fun onDetachedFromWindow() {
            stop()
            super.onDetachedFromWindow()
        }
    }
}
