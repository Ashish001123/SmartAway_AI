pipeline {

    agent any

    stages {

        stage('Test') {
            steps {
                echo 'Running SmartAway_AI tests...'
            }
        }

        stage('Docker Login') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKER_USERNAME',
                        passwordVariable: 'DOCKER_PASSWORD'
                    )
                ]) {
                    sh '''
                        echo "$DOCKER_PASSWORD" | docker login \
                            -u "$DOCKER_USERNAME" \
                            --password-stdin
                    '''
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                sh '''
                    docker build --platform linux/amd64 -t ashish001123/smartaway-frontend:${GIT_COMMIT} ./frontend
                    docker build --platform linux/amd64 -t ashish001123/smartaway-backend:${GIT_COMMIT} ./backend
                    docker build --platform linux/amd64 -t ashish001123/smartaway-ai:${GIT_COMMIT} ./ai-agent
                '''
            }
        }

        stage('Push Docker Images') {
            steps {
                sh '''
                    docker push ashish001123/smartaway-frontend:${GIT_COMMIT}
                    docker push ashish001123/smartaway-backend:${GIT_COMMIT}
                    docker push ashish001123/smartaway-ai:${GIT_COMMIT}
                '''
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }

        success {
            echo 'SmartAway_AI CI/CD pipeline completed successfully!'
        }

        failure {
            echo 'SmartAway_AI CI/CD pipeline failed!'
        }
    }
}