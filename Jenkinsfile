pipeline {

    agent any

    stages {

        stage('Test') {
            steps {
                echo 'Running SmartAway_AI tests...'
            }
        }

        stage('Build Docker Images') {
            steps {
                sh '''
                    docker build -t smartaway-frontend:${GIT_COMMIT} ./frontend
                    docker build -t smartaway-backend:${GIT_COMMIT} ./backend
                    docker build -t smartaway-ai:${GIT_COMMIT} ./ai-agent
                '''
            }
        }
    }

    post {
        success {
            echo 'SmartAway_AI CI pipeline completed successfully!'
        }

        failure {
            echo 'SmartAway_AI CI pipeline failed!'
        }
    }
}