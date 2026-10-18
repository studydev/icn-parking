package com.studydev.icnparking.core.forecast

import com.studydev.icnparking.core.generated.Strings

/** 상단 줄 문구(README 상단 줄). iOS Freshness.text와 같은 문구 */
val Freshness.text: String
    get() = when (this) {
        is Freshness.Normal -> Strings.Meta.updated(time, if (minutes == 0) Strings.Meta.justNow else Strings.Meta.minutesAgo(minutes.toString()))
        is Freshness.Delayed -> Strings.Meta.delayed(minutes.toString(), time)
        is Freshness.Offline -> Strings.Meta.offline(time)
    }

/** 지연·오프라인이면 상단 줄을 warn 색으로 */
val Freshness.isWarning: Boolean get() = this !is Freshness.Normal
