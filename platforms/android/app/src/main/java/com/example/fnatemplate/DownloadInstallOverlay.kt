package com.example.fnatemplate

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Space
import android.widget.TextView

/** Full-screen content preparation surface for landscape Android displays. */
class DownloadInstallOverlay(private val activity: Activity) {
    private val root = FrameLayout(activity).apply {
        setBackgroundColor(Color.rgb(10, 15, 19))
        isClickable = true
        isFocusable = false
        contentDescription = "tModLoader Mobile download and install center"
    }

    private val titleView = textView(24f, Color.WHITE, bold = true)
    private val detailView = textView(15f, Color.rgb(194, 207, 211))
    private val progress = ProgressBar(
        activity,
        null,
        android.R.attr.progressBarStyleHorizontal
    ).apply {
        max = 100
        contentDescription = "Content preparation progress"
    }
    private val progressValueView = textView(13f, Color.rgb(153, 226, 218), bold = true)
    private val transferView = textView(14f, Color.rgb(225, 235, 235))
    private val currentFileView = textView(13f, Color.rgb(168, 189, 193))
    private val storageView = textView(14f, Color.rgb(225, 235, 235))
    private val storageSection: LinearLayout
    private val transferSection: LinearLayout
    private val currentFileSection: LinearLayout
    private val stageDots = mutableListOf<TextView>()
    private val stageLabels = mutableListOf<TextView>()
    private val pauseButton: TextView
    private val resumeButton: TextView
    private val retryButton: TextView
    private val cancelButton: TextView

    private var actionHandler: ((LauncherAction) -> Unit)? = null
    private var attached = false
    private var lastProgressPercent = 0
    private var lastStage = STAGE_CHECKING

    init {
        val body = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.rgb(17, 24, 29))
        }

        body.addView(createIdentityRail(), LinearLayout.LayoutParams(0, MATCH, 0.31f))

        val workspace = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), dp(32), dp(40), dp(28))
        }
        val workspaceParams = LinearLayout.LayoutParams(0, MATCH, 0.69f)
        workspace.addView(createHeader(), LinearLayout.LayoutParams(MATCH, WRAP))
        workspace.addView(createProgressRow(), topMarginParams(20))
        workspace.addView(createStageIndicator(), topMarginParams(20))

        transferSection = createInfoSection("TRANSFER")
        transferSection.addView(transferView, sectionValueParams())
        workspace.addView(transferSection, topMarginParams(18))

        currentFileSection = createInfoSection("CURRENT FILE")
        currentFileSection.addView(currentFileView, sectionValueParams())
        workspace.addView(currentFileSection, topMarginParams(10))

        storageSection = createInfoSection("STORAGE")
        storageSection.addView(storageView, sectionValueParams())
        workspace.addView(storageSection, topMarginParams(10))

        val actions = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        pauseButton = createAction("Pause", "Pause content preparation")
        resumeButton = createAction("Resume", "Resume content preparation")
        retryButton = createAction("Retry", "Retry content preparation")
        cancelButton = createAction("Cancel", "Cancel content preparation")
        actions.addView(pauseButton, actionParams(0))
        actions.addView(resumeButton, actionParams(8))
        actions.addView(retryButton, actionParams(8))
        actions.addView(cancelButton, actionParams(8))
        workspace.addView(actions, LinearLayout.LayoutParams(MATCH, dp(56)).apply {
            topMargin = dp(18)
        })

        body.addView(workspace, workspaceParams)
        root.addView(body, FrameLayout.LayoutParams(MATCH, MATCH))

        bindAction(pauseButton, LauncherAction.Pause)
        bindAction(resumeButton, LauncherAction.Resume)
        bindAction(retryButton, LauncherAction.Retry)
        bindAction(cancelButton, LauncherAction.Cancel)
        setStorageSummary()
        setButtonsEnabled(false, false, false, false)
    }

    fun setActionHandler(handler: ((LauncherAction) -> Unit)?) {
        actionHandler = handler
    }

    fun render(state: LauncherUiState) {
        titleView.text = when (state) {
            is LauncherUiState.Ready -> "Content ready"
            is LauncherUiState.Downloading -> state.title
            is LauncherUiState.Installing -> state.title
            is LauncherUiState.Paused -> state.title
            is LauncherUiState.Launching -> state.title
            is LauncherUiState.Failed -> state.title
        }
        detailView.text = when (state) {
            is LauncherUiState.Ready -> "tModLoader Mobile ${state.version} is ready. ${state.detail}"
            is LauncherUiState.Downloading -> state.detail
            is LauncherUiState.Installing -> state.detail
            is LauncherUiState.Paused -> state.detail
            is LauncherUiState.Launching -> state.detail
            is LauncherUiState.Failed -> state.detail
        }

        val stage = stageFor(state)
        lastStage = stage
        when (state) {
            is LauncherUiState.Downloading -> {
                lastProgressPercent = state.progressPercent.coerceIn(0, 100)
                progress.isIndeterminate = state.indeterminate
                progress.progress = lastProgressPercent
                progressValueView.text = if (state.indeterminate) {
                    "Preparing"
                } else {
                    "${lastProgressPercent}%"
                }
                renderTransfer(state)
                setButtonsEnabled(true, false, false, true)
            }

            is LauncherUiState.Installing -> {
                progress.isIndeterminate = true
                progressValueView.text = "Working"
                hideTransferRows()
                setButtonsEnabled(true, false, false, true)
            }

            is LauncherUiState.Paused -> {
                progress.isIndeterminate = false
                progress.progress = lastProgressPercent
                progressValueView.text = "Paused at $lastProgressPercent%"
                hideTransferRows()
                setButtonsEnabled(false, true, false, true)
            }

            is LauncherUiState.Failed -> {
                progress.isIndeterminate = false
                progress.progress = lastProgressPercent
                progressValueView.text = "Needs attention"
                hideTransferRows()
                setButtonsEnabled(false, false, true, false)
            }

            is LauncherUiState.Ready -> {
                progress.isIndeterminate = false
                progress.progress = 100
                progressValueView.text = "100%"
                hideTransferRows()
                setButtonsEnabled(false, false, false, false)
            }

            is LauncherUiState.Launching -> {
                lastProgressPercent = state.progressPercent.coerceIn(0, 100)
                progress.isIndeterminate = state.progressPercent < 0
                progress.progress = lastProgressPercent
                progressValueView.text = if (state.progressPercent < 0) {
                    "Starting"
                } else {
                    "${lastProgressPercent}%"
                }
                hideTransferRows()
                setButtonsEnabled(false, false, false, false)
            }
        }
        renderStages(stage)
    }

    fun show() {
        if (!attached) {
            activity.addContentView(root, FrameLayout.LayoutParams(MATCH, MATCH))
            attached = true
        }
        root.visibility = View.VISIBLE
        root.bringToFront()
    }

    fun hide() {
        root.clearFocus()
        root.visibility = View.GONE
        (root.parent as? ViewGroup)?.removeView(root)
        attached = false
    }

    private fun createIdentityRail(): View = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(34), dp(34), dp(34), dp(28))
        background = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.rgb(36, 70, 73), Color.rgb(20, 43, 49), Color.rgb(14, 27, 33))
        )

        val logo = ImageView(activity).apply {
            setImageResource(R.drawable.tmodloader_icon)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            contentDescription = "tModLoader logo"
        }
        addView(logo, LinearLayout.LayoutParams(MATCH, dp(178)))

        addView(textView(25f, Color.WHITE, bold = true).apply {
            text = "tModLoader"
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(14) })
        addView(textView(17f, Color.rgb(167, 226, 218)).apply {
            text = "Mobile content center"
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(6) })

        addView(Space(activity), LinearLayout.LayoutParams(MATCH, 0, 1f))
        addView(textView(13f, Color.rgb(192, 215, 215)).apply {
            text = "Terraria content preparation"
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(MATCH, WRAP))
        addView(textView(12f, Color.rgb(161, 193, 194)).apply {
            text = "tModLoader ${BuildConfig.VERSION_NAME}"
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(8) })
    }

    private fun createHeader(): View = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        addView(titleView, LinearLayout.LayoutParams(MATCH, WRAP))
        detailView.setPadding(0, dp(8), 0, 0)
        detailView.maxLines = 2
        detailView.ellipsize = TextUtils.TruncateAt.END
        addView(detailView, LinearLayout.LayoutParams(MATCH, WRAP))
    }

    private fun createProgressRow(): View = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        progressValueView.gravity = Gravity.END or Gravity.CENTER_VERTICAL
        addView(progress, LinearLayout.LayoutParams(0, dp(10), 1f))
        addView(progressValueView, LinearLayout.LayoutParams(dp(116), dp(36)).apply {
            leftMargin = dp(16)
        })
    }

    private fun createStageIndicator(): View = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val labels = listOf("Check", "Sign in", "Download", "Install", "Ready")
        labels.forEachIndexed { index, label ->
            val stage = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
            }
            val dot = TextView(activity).apply {
                gravity = Gravity.CENTER
                text = (index + 1).toString()
                textSize = 11f
                setTextColor(Color.rgb(112, 135, 139))
                background = circle(Color.rgb(31, 47, 53))
            }
            val stageLabel = textView(11f, Color.rgb(128, 151, 154)).apply {
                text = label
                gravity = Gravity.CENTER
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            stageDots += dot
            stageLabels += stageLabel
            stage.addView(dot, LinearLayout.LayoutParams(dp(28), dp(28)))
            stage.addView(stageLabel, LinearLayout.LayoutParams(MATCH, dp(24)).apply {
                topMargin = dp(6)
            })
            addView(stage, LinearLayout.LayoutParams(0, dp(58), 1f))
        }
    }

    private fun createInfoSection(label: String): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(10), dp(16), dp(10))
        background = rounded(Color.rgb(25, 37, 42), dp(7))
        addView(textView(10f, Color.rgb(123, 178, 176), bold = true).apply {
            text = label
            letterSpacing = 0.12f
        }, LinearLayout.LayoutParams(MATCH, dp(18)))
    }

    private fun createAction(label: String, description: String): TextView = TextView(activity).apply {
        text = label
        textSize = 14f
        gravity = Gravity.CENTER
        typeface = Typeface.DEFAULT_BOLD
        minHeight = dp(48)
        isFocusable = true
        isClickable = true
        contentDescription = description
        setPadding(dp(10), 0, dp(10), 0)
    }

    private fun bindAction(button: TextView, action: LauncherAction) {
        button.setOnClickListener {
            if (button.isEnabled) actionHandler?.invoke(action)
        }
    }

    private fun renderTransfer(state: LauncherUiState.Downloading) {
        val values = mutableListOf<String>()
        if (state.completedFiles != null && state.totalFiles != null) {
            values += "${state.completedFiles} / ${state.totalFiles} files"
        }
        if (!state.downloadedBytes.isNullOrBlank() && !state.totalBytes.isNullOrBlank()) {
            values += "${state.downloadedBytes} / ${state.totalBytes}"
        }
        if (!state.speed.isNullOrBlank()) values += state.speed
        transferSection.visibility = if (values.isEmpty()) View.GONE else View.VISIBLE
        transferView.text = values.joinToString("   ")

        val currentFile = state.currentFile?.takeIf(String::isNotBlank)
        currentFileSection.visibility = if (currentFile == null) View.GONE else View.VISIBLE
        currentFileView.text = currentFile
        currentFileView.maxLines = 1
        currentFileView.ellipsize = TextUtils.TruncateAt.MIDDLE
    }

    private fun hideTransferRows() {
        transferSection.visibility = View.GONE
        currentFileSection.visibility = View.GONE
    }

    private fun setStorageSummary() {
        storageView.text = "App-managed storage   •   Content files remain available for resume"
    }

    private fun setButtonsEnabled(pause: Boolean, resume: Boolean, retry: Boolean, cancel: Boolean) {
        setButtonState(pauseButton, pause)
        setButtonState(resumeButton, resume)
        setButtonState(retryButton, retry)
        setButtonState(cancelButton, cancel)
    }

    private fun setButtonState(button: TextView, enabled: Boolean) {
        button.isEnabled = enabled
        button.alpha = if (enabled) 1f else 0.38f
        button.background = if (enabled) {
            rounded(Color.rgb(126, 205, 196), dp(6))
        } else {
            rounded(Color.rgb(42, 55, 60), dp(6), Color.rgb(64, 80, 84))
        }
        button.setTextColor(if (enabled) Color.rgb(12, 34, 36) else Color.rgb(146, 163, 165))
    }

    private fun renderStages(activeStage: Int) {
        stageDots.forEachIndexed { index, dot ->
            val completed = index < activeStage
            dot.text = if (completed) "✓" else (index + 1).toString()
            dot.setTextColor(if (index <= activeStage) Color.rgb(11, 38, 39) else Color.rgb(112, 135, 139))
            dot.background = circle(if (index <= activeStage) {
                Color.rgb(126, 205, 196)
            } else {
                Color.rgb(31, 47, 53)
            })
        }
        stageLabels.forEachIndexed { index, label ->
            label.setTextColor(if (index == activeStage) {
                Color.rgb(167, 226, 218)
            } else if (index < activeStage) {
                Color.rgb(183, 207, 207)
            } else {
                Color.rgb(128, 151, 154)
            })
        }
    }

    private fun stageFor(state: LauncherUiState): Int = when (state) {
        is LauncherUiState.Downloading -> STAGE_DOWNLOADING
        is LauncherUiState.Installing -> STAGE_INSTALLING
        is LauncherUiState.Paused -> lastStage.coerceIn(STAGE_DOWNLOADING, STAGE_INSTALLING)
        is LauncherUiState.Ready -> STAGE_READY
        is LauncherUiState.Launching -> STAGE_READY
        is LauncherUiState.Failed -> lastStage.coerceIn(STAGE_CHECKING, STAGE_INSTALLING)
    }

    private fun textView(size: Float, color: Int, bold: Boolean = false) = TextView(activity).apply {
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun rounded(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }

    private fun circle(color: Int) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
    }

    private fun sectionValueParams() = LinearLayout.LayoutParams(MATCH, dp(24)).apply {
        topMargin = dp(2)
    }

    private fun actionParams(left: Int) = LinearLayout.LayoutParams(0, MATCH, 1f).apply {
        if (left > 0) leftMargin = dp(left)
    }

    private fun topMarginParams(top: Int) = LinearLayout.LayoutParams(MATCH, WRAP).apply {
        topMargin = dp(top)
    }

    private fun dp(value: Int): Int =
        (value * activity.resources.displayMetrics.density + 0.5f).toInt()

    private companion object {
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
        const val STAGE_CHECKING = 0
        const val STAGE_DOWNLOADING = 2
        const val STAGE_INSTALLING = 3
        const val STAGE_READY = 4
    }
}
