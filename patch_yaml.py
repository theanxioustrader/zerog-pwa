content = open('codemagic.yaml', 'rb').read()

old = (
    b'      - name: Set Xcode signing settings\n'
    b'        script: xcode-project use-profiles\n'
    b'\n'
    b'      - name: Build IPA'
)

new = (
    b'      - name: Set build number\n'
    b'        script: |\n'
    b'          agvtool new-version -all $BUILD_NUMBER || \\\n'
    b'            /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" ios/App/App/Info.plist\n'
    b'\n'
    b'      - name: Set Xcode signing settings\n'
    b'        script: xcode-project use-profiles\n'
    b'\n'
    b'      - name: Build IPA'
)

if old in content:
    open('codemagic.yaml', 'wb').write(content.replace(old, new, 1))
    print('PATCHED OK')
else:
    print('NOT FOUND')
    idx = content.find(b'Set Xcode signing settings')
    print(repr(content[idx-10:idx+100]))
