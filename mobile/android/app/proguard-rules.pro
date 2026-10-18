# kotlinx.serialization·Glance·Compose는 라이브러리에 R8 규칙이 들어 있다.

# WorkManager 2.7.1(Glance 1.1.1이 가져옴)은 Room이 WorkDatabase_Impl을 이름으로 찾는다(리플렉션).
# R8 전체 모드에서 이 클래스가 지워지면 앱 시작 때 "Failed to create an instance of WorkDatabase"로 죽는다.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
