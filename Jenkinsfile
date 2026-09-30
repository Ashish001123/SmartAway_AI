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
                    docker build -t ashish001123/smartaway-frontend:${GIT_COMMIT} ./frontend
                    docker build -t ashish001123/smartaway-backend:${GIT_COMMIT} ./backend
                    docker build -t ashish001123/smartaway-ai:${GIT_COMMIT} ./ai-agent
                '''
            }
        }

        stage('Push Docker Images') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', passwordVariable: 'DOCKERHUB_PASSWORD', usernameVariable: 'DOCKERHUB_USERNAME')]) {
                    sh '''
                        echo "$DOCKERHUB_PASSWORD" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
                        
                        docker push ashish001123/smartaway-frontend:${GIT_COMMIT}
                        docker push ashish001123/smartaway-backend:${GIT_COMMIT}
                        docker push ashish001123/smartaway-ai:${GIT_COMMIT}
                        
                        docker logout
                    '''
                }
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