# Project README

## Project Description

Add your project description here.


## Project Structure

```
Omegle/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api/
│   │   │   └── auth.js
│   │   ├── auth/
│   │   │   ├── authManager.js
│   │   │   ├── emailValidator.js
│   │   │   └── mfaManager.js
│   │   ├── chat/
│   │   │   └── chatManager.js
│   │   ├── utils/
│   │   │   ├── helpers.js
│   │   │   ├── logger.js
│   │   │   └── security.js
│   │   ├── video/
│   │   │   ├── peerConnection.js
│   │   │   ├── videoChatApp.js
│   │   │   └── videoManager.js
│   │   ├── admin-dashboard.js
│   │   ├── dashboard.js
│   │   └── main.js
│   ├── admin-dashboard.html
│   ├── chat.html
│   ├── dashboard.html
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   ├── verify.html
│   └── video-chat.html
├── server/
│   ├── config/
│   │   ├── constants.js
│   │   └── security.js
│   ├── logs/
│   │   ├── combined.log
│   │   └── error.log
│   ├── models/
│   │   ├── Session.js
│   │   └── User.js
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── authMiddleware.js
│   │   │   ├── emailService.js
│   │   │   └── mfaManager.js
│   │   ├── chat/
│   │   │   └── chatHandler.js
│   │   ├── middleware/
│   │   │   └── advancedSecurity.js
│   │   ├── monitoring/
│   │   │   └── rateLimiter.js
│   │   ├── pairing/
│   │   │   └── pairingManager.js
│   │   ├── signaling/
│   │   │   └── signalingHandler.js
│   │   └── video/
│   │       └── secureVideoManager.js
│   ├── utils/
│   │   ├── advancedEncryption.js
│   │   ├── encryption.js
│   │   ├── healthMonitor.js
│   │   ├── logger.js
│   │   └── validation.js
│   ├── server.js
│   └── test-paths.js
├── venv/
│   ├── Lib/
│   │   └── site-packages/
│   │       ├── pip/
│   │       │   ├── __pycache__/
│   │       │   │   ├── __init__.cpython-313.pyc
│   │       │   │   ├── __main__.cpython-313.pyc
│   │       │   │   └── __pip-runner__.cpython-313.pyc
│   │       │   ├── _internal/
│   │       │   │   ├── __init__.py
│   │       │   │   ├── build_env.py
│   │       │   │   ├── cache.py
│   │       │   │   ├── configuration.py
│   │       │   │   ├── exceptions.py
│   │       │   │   ├── main.py
│   │       │   │   ├── pyproject.py
│   │       │   │   ├── self_outdated_check.py
│   │       │   │   └── wheel_builder.py
│   │       │   ├── _vendor/
│   │       │   │   ├── __init__.py
│   │       │   │   ├── typing_extensions.py
│   │       │   │   └── vendor.txt
│   │       │   ├── __init__.py
│   │       │   ├── __main__.py
│   │       │   ├── __pip-runner__.py
│   │       │   └── py.typed
│   │       └── pip-25.0.1.dist-info/
│   │           ├── AUTHORS.txt
│   │           ├── entry_points.txt
│   │           ├── INSTALLER
│   │           ├── LICENSE.txt
│   │           ├── METADATA
│   │           ├── RECORD
│   │           ├── REQUESTED
│   │           ├── top_level.txt
│   │           └── WHEEL
│   ├── Scripts/
│   │   ├── activate
│   │   ├── activate.bat
│   │   ├── activate.fish
│   │   ├── Activate.ps1
│   │   ├── deactivate.bat
│   │   ├── pip.exe
│   │   ├── pip3.13.exe
│   │   ├── pip3.exe
│   │   ├── python.exe
│   │   └── pythonw.exe
│   └── pyvenv.cfg
├── debug-server.js
├── package-lock.json
├── package.json
├── README.md
└── requirements.txt
```
