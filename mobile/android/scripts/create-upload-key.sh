#!/bin/sh
# Play Console에 올릴 앱 번들(AAB)을 서명할 "업로드 키"를 만든다. 비밀번호는 직접 입력한다(화면에 보이지 않음).
#   sh mobile/android/scripts/create-upload-key.sh
#
# - 키 파일: ~/keys/icn-upload.jks (저장소 밖). 이미 있으면 덮어쓰지 않고 멈춘다.
# - 비밀번호는 mobile/android/local.properties(git 제외)에 적힌다. 같은 비밀번호를 비밀번호 관리자에도 보관할 것.
# - Play 앱 서명을 쓰면 업로드 키를 잃어도 Play Console에서 재설정할 수 있다. 앱 서명 키 자체는 Google이 보관한다.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
props="${LOCAL_PROPERTIES:-$here/../local.properties}"
keystore="${ICN_UPLOAD_KEYSTORE_PATH:-$HOME/keys/icn-upload.jks}"
alias_name="${ICN_UPLOAD_KEY_ALIAS:-upload}"
keytool="${KEYTOOL:-/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool}"
[ -x "$keytool" ] || keytool=$(command -v keytool || true)
[ -n "$keytool" ] || { echo "keytool을 찾을 수 없습니다. JDK 또는 Android Studio를 설치하세요." >&2; exit 1; }

if [ -e "$keystore" ]; then
  echo "이미 키 파일이 있어 중단합니다: $keystore" >&2
  echo "다른 위치에 만들려면 ICN_UPLOAD_KEYSTORE_PATH=... 로 실행하세요." >&2
  exit 1
fi

# 테스트용으로만 환경 변수로 받을 수 있다. 평소에는 입력창에서 받는다.
if [ -z "${ICN_UPLOAD_PASSWORD:-}" ]; then
  printf '업로드 키 비밀번호(6자 이상): '; stty -echo; read -r pw1; stty echo; printf '\n'
  printf '한 번 더: '; stty -echo; read -r pw2; stty echo; printf '\n'
  [ "$pw1" = "$pw2" ] || { echo "비밀번호가 서로 다릅니다." >&2; exit 1; }
  ICN_UPLOAD_PASSWORD=$pw1
fi
[ "${#ICN_UPLOAD_PASSWORD}" -ge 6 ] || { echo "비밀번호는 6자 이상이어야 합니다." >&2; exit 1; }
export ICN_UPLOAD_PASSWORD

mkdir -p "$(dirname "$keystore")"
chmod 700 "$(dirname "$keystore")"
# 비밀번호를 명령줄에 넣지 않는다(프로세스 목록에 보이므로): 환경 변수로 전달
"$keytool" -genkeypair -v -keystore "$keystore" -alias "$alias_name" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass:env ICN_UPLOAD_PASSWORD -keypass:env ICN_UPLOAD_PASSWORD \
  -dname "${ICN_UPLOAD_DNAME:-CN=ICN Airport Parking, O=Personal, C=KR}" >/dev/null
chmod 600 "$keystore"

touch "$props"
chmod 600 "$props"
# 같은 키가 이미 적혀 있으면 지우고 새로 적는다
grep -vE '^icn\.upload(Keystore|KeystorePassword|KeyAlias|KeyPassword)=' "$props" > "$props.tmp" || true
{
  cat "$props.tmp"
  echo "icn.uploadKeystore=$keystore"
  echo "icn.uploadKeystorePassword=$ICN_UPLOAD_PASSWORD"
  echo "icn.uploadKeyAlias=$alias_name"
  echo "icn.uploadKeyPassword=$ICN_UPLOAD_PASSWORD"
} > "$props"
rm -f "$props.tmp"

echo "업로드 키를 만들었습니다."
echo "  키 파일    : $keystore"
echo "  설정 파일  : $props (git 제외)"
echo "다음: 키 파일과 비밀번호를 백업하세요. AAB 빌드는  cd mobile/android && ./gradlew bundleRelease"
