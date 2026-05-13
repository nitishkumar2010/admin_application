pipeline {
    agent any

    parameters {
        string(name: 'PORT', defaultValue: '3000', description: 'Port for next dev')
        booleanParam(name: 'KEEP_RUNNING', defaultValue: true,
                     description: 'If true, leave the dev server running after the build finishes')
    }

    environment {
        CI            = 'true'
        NEXT_TELEMETRY_DISABLED = '1'
        APP_DIR       = "${WORKSPACE}"
        LOG_FILE      = "${WORKSPACE}/next-dev.log"
        PID_FILE      = "${WORKSPACE}/next-dev.pid"
    }

    options {
        timestamps()
        timeout(time: 10, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('Tool check') {
            steps {
                sh '''
                    echo "--- Tool versions ---"
                    node -v
                    npm  -v
                    NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
                    if [ "$NODE_MAJOR" -lt 20 ]; then
                      echo "Node 20+ required (package.json engines)"; exit 1
                    fi
                '''
            }
        }

        stage('Stop previous run') {
            steps {
                sh '''
                    if [ -f "$PID_FILE" ]; then
                      OLD_PID=$(cat "$PID_FILE" || true)
                      if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
                        echo "Killing previous dev server (PID $OLD_PID)"
                        kill "$OLD_PID" || true
                        sleep 2
                        kill -9 "$OLD_PID" 2>/dev/null || true
                      fi
                      rm -f "$PID_FILE"
                    fi
                    # belt-and-braces: anything listening on the port
                    if command -v lsof >/dev/null 2>&1; then
                      PORT_PID=$(lsof -ti tcp:${PORT} || true)
                      if [ -n "$PORT_PID" ]; then
                        echo "Port ${PORT} busy, killing PID(s): $PORT_PID"
                        kill -9 $PORT_PID || true
                      fi
                    fi
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                sh '''
                    if [ -f package-lock.json ]; then
                      npm ci
                    else
                      npm install
                    fi
                '''
            }
        }

        stage('Prisma generate') {
            steps {
                // Generates @prisma/client into node_modules. Doesn't need a real DB.
                sh 'npx prisma generate'
            }
        }

        stage('Lint') {
            steps {
                // Don't fail the pipeline on lint issues for a local smoke run.
                sh 'npm run lint || true'
            }
        }

        stage('Start dev server') {
            steps {
                // Subshell + nohup + disown detaches the dev server from the Jenkins
                // shell's process group so the stage can finish without killing it.
                // Works on both macOS and Linux (avoids `setsid`, which is Linux-only).
                // We call `npx next dev` directly because the npm "dev" script already
                // hardcodes `-p 3000`, which would cause a duplicated `-p` flag.
                sh '''
                    echo "Starting next dev on port ${PORT}..."
                    (
                      nohup npx next dev -p ${PORT} > "$LOG_FILE" 2>&1 &
                      echo $! > "$PID_FILE"
                      disown
                    ) 2>/dev/null
                    sleep 1
                    echo "Started PID $(cat $PID_FILE), logs: $LOG_FILE"
                '''
            }
        }

        stage('Wait for ready') {
            steps {
                sh '''
                    echo "Waiting for http://localhost:${PORT}/api/health ..."
                    for i in $(seq 1 60); do
                      CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/health" || echo "000")
                      if [ "$CODE" = "200" ]; then
                        echo "Dev server is up (HTTP $CODE) after ${i}s"
                        curl -s "http://localhost:${PORT}/api/health"
                        echo
                        exit 0
                      fi
                      # also fail fast if the process died
                      PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
                      if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then
                        echo "Dev server process exited unexpectedly. Last 100 log lines:"
                        tail -n 100 "$LOG_FILE" || true
                        exit 1
                      fi
                      sleep 1
                    done
                    echo "Timed out waiting for dev server. Last 200 log lines:"
                    tail -n 200 "$LOG_FILE" || true
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            script {
                def pid = sh(returnStdout: true, script: "cat ${PID_FILE} 2>/dev/null || true").trim()
                if (params.KEEP_RUNNING) {
                    echo "Dev server kept running."
                    echo "  URL:  http://localhost:${params.PORT}"
                    echo "  PID:  ${pid}"
                    echo "  Logs: ${env.LOG_FILE}"
                    echo "  Stop: kill ${pid}    (or:  kill \$(cat ${env.PID_FILE}))"
                } else {
                    echo "KEEP_RUNNING=false — stopping dev server (PID ${pid})."
                    sh '''
                        if [ -f "$PID_FILE" ]; then
                          PID=$(cat "$PID_FILE")
                          kill "$PID" 2>/dev/null || true
                          sleep 2
                          kill -9 "$PID" 2>/dev/null || true
                          rm -f "$PID_FILE"
                        fi
                    '''
                }
            }
        }
        failure {
            echo "Build failed. Cleaning up dev server if it started."
            sh '''
                if [ -f "$PID_FILE" ]; then
                  PID=$(cat "$PID_FILE")
                  kill "$PID" 2>/dev/null || true
                  sleep 1
                  kill -9 "$PID" 2>/dev/null || true
                fi
                if [ -f "$LOG_FILE" ]; then
                  echo "--- Last 200 lines of dev log ---"
                  tail -n 200 "$LOG_FILE" || true
                fi
            '''
        }
        always {
            archiveArtifacts artifacts: 'next-dev.log', allowEmptyArchive: true, fingerprint: false
        }
    }
}
